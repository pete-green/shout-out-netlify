import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const API_URL = '/.netlify/functions';

interface Webhook {
  id: number;
  name: string;
  url: string;
  tags: string[];
  is_active: boolean;
  created_at: string;
  stats: {
    total_deliveries: number;
    successful_deliveries: number;
    last_delivery: { sent_at: string; status: string } | null;
  };
}

interface Settings {
  big_sale_threshold: number;
  tgl_option_name: string;
  polling_interval_minutes: number;
}

interface WebhookLog {
  id: number;
  webhook_id: number;
  celebration_type: string;
  status: string;
  error_message: string | null;
  estimate_id: string;
  sent_at: string;
}

interface PollLog {
  id: number;
  status: string;
  estimates_found: number;
  estimates_processed: number;
  duration_ms: number;
  error_message: string | null;
  created_at: string;
}

interface PollStatus {
  polling_enabled: boolean;
  polling_interval_minutes: number;
  last_poll_timestamp: string | null;
  next_poll_estimate: string | null;
  logs: PollLog[];
  stats: {
    total_polls_24h: number;
    successful_polls_24h: number;
    failed_polls_24h: number;
    skipped_polls_24h: number;
    total_estimates_24h: number;
    average_duration_ms: number;
    success_rate_24h: number;
  };
}

interface Estimate {
  id: number;
  estimate_id: string;
  salesperson: string;
  customer_name: string;
  amount: number;
  sold_at: string;
  is_tgl: boolean;
  is_big_sale: boolean;
  option_name: string | null;
  job_number: string;
  location_id: string;
  business_unit: string;
}

export default function Configuration() {
  // Polling interval is hardcoded to match netlify.toml schedule
  const POLLING_INTERVAL_MINUTES = 5;

  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Webhook modal state
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [webhookForm, setWebhookForm] = useState({
    name: '',
    url: '',
    tags: [] as string[],
    is_active: true,
  });
  const [webhookFormError, setWebhookFormError] = useState<string | null>(null);
  const [testingWebhook, setTestingWebhook] = useState<number | null>(null);

  // Logs modal state
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [logsSummary, setLogsSummary] = useState<any>(null);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<Settings>({
    big_sale_threshold: 700,
    tgl_option_name: 'Option C - System Update',
    polling_interval_minutes: 5,
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Polling status state
  const [pollStatus, setPollStatus] = useState<PollStatus | null>(null);
  const [togglingPolling, setTogglingPolling] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [triggeringPoll, setTriggeringPoll] = useState(false);
  const [expandedPollId, setExpandedPollId] = useState<number | null>(null);
  const [pollEstimates, setPollEstimates] = useState<{ [key: number]: Estimate[] }>({});

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Reset to page 1 when logs data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [pollStatus?.logs.length]);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearingData, setClearingData] = useState(false);

  useEffect(() => {
    fetchData();
    fetchPollStatus();
  }, []);

  // Real-time subscription - listen for new poll logs
  useEffect(() => {
    console.log('📡 Setting up Realtime subscription for poll logs');

    const channel = supabase
      .channel('config-poll-logs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'poll_logs',
        },
        (payload) => {
          console.log('🔔 New poll log detected via Realtime!', payload);
          // Refresh poll status when new poll log is added
          fetchPollStatus();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime subscription active for poll logs');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Realtime subscription error');
        }
      });

    return () => {
      console.log('🔌 Cleaning up Realtime subscription');
      supabase.removeChannel(channel);
    };
  }, []);

  // Countdown timer - updates every second
  useEffect(() => {
    if (!pollStatus?.next_poll_estimate || !pollStatus?.polling_enabled) {
      setCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const nextPoll = new Date(pollStatus.next_poll_estimate!).getTime();
      const secondsRemaining = Math.floor((nextPoll - now) / 1000);
      setCountdown(secondsRemaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [pollStatus?.next_poll_estimate, pollStatus?.polling_enabled]);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [webhooksRes, settingsRes] = await Promise.all([
        fetch(`${API_URL}/webhooks`),
        fetch(`${API_URL}/settings`),
      ]);

      if (!webhooksRes.ok || !settingsRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const webhooksData = await webhooksRes.json();
      const settingsData = await settingsRes.json();

      setWebhooks(webhooksData);
      setSettingsForm(settingsData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Webhook CRUD operations
  async function handleSaveWebhook() {
    setWebhookFormError(null);

    // Validation
    if (!webhookForm.name.trim()) {
      setWebhookFormError('Name is required');
      return;
    }
    if (!webhookForm.url.trim()) {
      setWebhookFormError('URL is required');
      return;
    }
    if (webhookForm.tags.length === 0) {
      setWebhookFormError('At least one tag is required');
      return;
    }

    try {
      const method = editingWebhook ? 'PATCH' : 'POST';
      const url = editingWebhook
        ? `${API_URL}/webhooks/${editingWebhook.id}`
        : `${API_URL}/webhooks`;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookForm),
      });

      const data = await response.json();

      if (!response.ok) {
        setWebhookFormError(data.error || 'Failed to save webhook');
        return;
      }

      setShowWebhookModal(false);
      setEditingWebhook(null);
      setWebhookForm({ name: '', url: '', tags: [], is_active: true });
      fetchData();
    } catch (err: any) {
      setWebhookFormError(err.message);
    }
  }

  async function handleDeleteWebhook(id: number) {
    if (!confirm('Are you sure you want to delete this webhook?')) return;

    try {
      const response = await fetch(`${API_URL}/webhooks/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete webhook');
      }

      fetchData();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  }

  async function handleTestWebhook(id: number) {
    setTestingWebhook(id);
    try {
      const response = await fetch(`${API_URL}/webhooks/${id}/test`, {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        alert('Test message sent successfully! Check your Google Chat room.');
      } else {
        alert(`Test failed: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setTestingWebhook(null);
    }
  }

  async function handleViewLogs(webhookId: number) {
    setShowLogsModal(true);

    try {
      const response = await fetch(`${API_URL}/webhook-logs?webhook_id=${webhookId}&limit=50`);
      const data = await response.json();

      if (response.ok) {
        setLogs(data.logs);
        setLogsSummary(data.summary);
      }
    } catch (err: any) {
      console.error('Failed to fetch logs:', err);
    }
  }

  // Settings operations
  async function handleSaveSettings() {
    setSavingSettings(true);
    try {
      const response = await fetch(`${API_URL}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save settings');
      }

      alert('Settings saved successfully!');
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  }

  // Polling operations
  async function fetchPollStatus() {
    try {
      const response = await fetch(`${API_URL}/poll-status`);
      if (response.ok) {
        const data = await response.json();
        setPollStatus(data);
      }
    } catch (err: any) {
      console.error('Failed to fetch poll status:', err);
    }
  }

  async function togglePolling() {
    if (!pollStatus) return;

    const newState = !pollStatus.polling_enabled;
    const confirmMessage = newState
      ? 'Are you sure you want to enable polling? The system will start checking for new sales automatically.'
      : 'Are you sure you want to disable polling? New sales won\'t be detected while polling is off.';

    if (!confirm(confirmMessage)) return;

    setTogglingPolling(true);
    try {
      const response = await fetch(`${API_URL}/poll-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polling_enabled: newState }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to toggle polling');
      }

      // Refresh status
      await fetchPollStatus();
      alert(data.message);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setTogglingPolling(false);
    }
  }

  function formatCountdown(seconds: number): string {
    if (seconds < 0) return "Polling soon...";
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  async function triggerManualPoll() {
    if (!confirm('Trigger a poll now? This will check ServiceTitan for new sales immediately.')) {
      return;
    }

    setTriggeringPoll(true);
    try {
      const response = await fetch(`${API_URL}/manual-poll`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to trigger poll: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      alert(`Poll triggered successfully!\n\nFound: ${data.estimatesFound} estimates\nProcessed: ${data.estimatesProcessed}`);
      await fetchPollStatus(); // Refresh to show new log
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setTriggeringPoll(false);
    }
  }

  async function fetchPollDetails(pollLogId: number) {
    // Toggle expansion
    if (expandedPollId === pollLogId) {
      setExpandedPollId(null);
      return;
    }

    // If we already have the data, just expand
    if (pollEstimates[pollLogId]) {
      setExpandedPollId(pollLogId);
      return;
    }

    // Fetch the estimates for this poll
    try {
      const response = await fetch(`${API_URL}/poll-details?poll_log_id=${pollLogId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch poll details');
      }

      const data = await response.json();
      setPollEstimates((prev) => ({
        ...prev,
        [pollLogId]: data.estimates,
      }));
      setExpandedPollId(pollLogId);
    } catch (err: any) {
      alert(`Error fetching poll details: ${err.message}`);
    }
  }

  async function clearTestingData() {
    try {
      setClearingData(true);
      const response = await fetch(`${API_URL}/clear-test-data`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to clear testing data');
      }

      const data = await response.json();

      alert(`Testing data cleared successfully!\n\nDeleted:\n- ${data.deleted.estimates} estimates\n- ${data.deleted.poll_logs} poll logs\n- ${data.deleted.webhook_logs} webhook logs\n\nThe next poll will detect all of today's sales as new.`);

      // Refresh the poll status to show empty state
      await fetchPollStatus();
      setExpandedPollId(null);
      setPollEstimates({});
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setClearingData(false);
      setShowClearConfirm(false);
    }
  }

  function openWebhookModal(webhook?: Webhook) {
    if (webhook) {
      setEditingWebhook(webhook);
      setWebhookForm({
        name: webhook.name,
        url: webhook.url,
        tags: webhook.tags,
        is_active: webhook.is_active,
      });
    } else {
      setEditingWebhook(null);
      setWebhookForm({ name: '', url: '', tags: [], is_active: true });
    }
    setWebhookFormError(null);
    setShowWebhookModal(true);
  }

  // Styles
  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    backgroundColor: '#0f172a',
    padding: '2rem',
  };

  const sectionStyle: React.CSSProperties = {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    padding: '1.5rem',
    marginBottom: '2rem',
  };

  const headerStyle: React.CSSProperties = {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#f1f5f9',
    marginBottom: '1rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '1rem',
  };

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '0.75rem',
    borderBottom: '2px solid #334155',
    color: '#94a3b8',
    fontSize: '0.875rem',
    fontWeight: '600',
    textTransform: 'uppercase',
  };

  const tdStyle: React.CSSProperties = {
    padding: '0.75rem',
    borderBottom: '1px solid #334155',
    color: '#e2e8f0',
  };

  const buttonStyle: React.CSSProperties = {
    backgroundColor: '#3b82f6',
    color: 'white',
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
  };

  const secondaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#64748b',
    marginRight: '0.5rem',
  };

  const dangerButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#ef4444',
  };

  const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  };

  const modalStyle: React.CSSProperties = {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    padding: '2rem',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.75rem',
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '6px',
    color: '#f1f5f9',
    fontSize: '1rem',
    marginBottom: '1rem',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: '#94a3b8',
    fontSize: '0.875rem',
    fontWeight: '600',
    marginBottom: '0.5rem',
  };

  const tagStyle = (selected: boolean): React.CSSProperties => ({
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: '6px',
    fontSize: '0.75rem',
    fontWeight: '600',
    marginRight: '0.5rem',
    backgroundColor: selected ? '#3b82f6' : '#334155',
    color: selected ? 'white' : '#94a3b8',
    cursor: 'pointer',
    userSelect: 'none',
  });

  const cardStyle: React.CSSProperties = {
    backgroundColor: '#0f172a',
    borderRadius: '8px',
    padding: '1.5rem',
    marginBottom: '1rem',
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ color: '#f1f5f9', textAlign: 'center', fontSize: '1.25rem' }}>
          Loading configuration...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={{ color: '#ef4444', textAlign: 'center', fontSize: '1.25rem' }}>
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Webhooks Section */}
      <div style={sectionStyle}>
        <div style={headerStyle}>
          <span>Google Chat Webhooks</span>
          <button style={buttonStyle} onClick={() => openWebhookModal()}>
            + Add Webhook
          </button>
        </div>

        {webhooks.length === 0 ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
            No webhooks configured. Add your first webhook to start receiving celebrations!
          </div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>URL</th>
                <th style={thStyle}>Tags</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Last Delivery</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((webhook) => (
                <tr key={webhook.id}>
                  <td style={tdStyle}>{webhook.name}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {webhook.url.substring(0, 50)}...
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {webhook.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          ...tagStyle(true),
                          cursor: 'default',
                          marginBottom: '0.25rem',
                        }}
                      >
                        {tag === 'tgl' ? 'TGL' : 'Big Sale'}
                      </span>
                    ))}
                  </td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        color: webhook.is_active ? '#10b981' : '#ef4444',
                        fontWeight: '600',
                      }}
                    >
                      {webhook.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {webhook.stats.last_delivery ? (
                      <div>
                        <div style={{ fontSize: '0.75rem' }}>
                          {new Date(webhook.stats.last_delivery.sent_at).toLocaleString()}
                        </div>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color:
                              webhook.stats.last_delivery.status === 'success'
                                ? '#10b981'
                                : '#ef4444',
                          }}
                        >
                          {webhook.stats.last_delivery.status}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: '#64748b', fontSize: '0.875rem' }}>Never</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <button
                      style={{ ...secondaryButtonStyle, marginBottom: '0.25rem' }}
                      onClick={() => handleTestWebhook(webhook.id)}
                      disabled={testingWebhook === webhook.id}
                    >
                      {testingWebhook === webhook.id ? 'Testing...' : 'Test'}
                    </button>
                    <button
                      style={{ ...secondaryButtonStyle, marginBottom: '0.25rem' }}
                      onClick={() => handleViewLogs(webhook.id)}
                    >
                      Logs
                    </button>
                    <button
                      style={{ ...secondaryButtonStyle, marginBottom: '0.25rem' }}
                      onClick={() => openWebhookModal(webhook)}
                    >
                      Edit
                    </button>
                    <button
                      style={dangerButtonStyle}
                      onClick={() => handleDeleteWebhook(webhook.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Settings Section */}
      <div style={sectionStyle}>
        <div style={headerStyle}>
          <span>App Settings</span>
        </div>

        <div style={cardStyle}>
          <label style={labelStyle}>Big Sale Threshold ($)</label>
          <input
            type="number"
            style={inputStyle}
            value={settingsForm.big_sale_threshold}
            onChange={(e) =>
              setSettingsForm({
                ...settingsForm,
                big_sale_threshold: parseInt(e.target.value) || 0,
              })
            }
            min="1"
          />
          <div style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Sales above this amount will trigger a Big Sale celebration
          </div>
        </div>

        <div style={cardStyle}>
          <label style={labelStyle}>TGL Option Name</label>
          <input
            type="text"
            style={inputStyle}
            value={settingsForm.tgl_option_name}
            onChange={(e) =>
              setSettingsForm({ ...settingsForm, tgl_option_name: e.target.value })
            }
          />
          <div style={{ color: '#64748b', fontSize: '0.875rem' }}>
            The SKU name that identifies a TGL sale (e.g., "Option C - System Update")
          </div>
        </div>

        <button
          style={{ ...buttonStyle, width: '100%', padding: '0.75rem' }}
          onClick={handleSaveSettings}
          disabled={savingSettings}
        >
          {savingSettings ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Polling Section */}
      <div style={sectionStyle}>
        <div style={headerStyle}>
          <span>Polling</span>
        </div>

        {pollStatus ? (
          <>
            {/* Status Card */}
            <div
              style={{
                ...cardStyle,
                backgroundColor: pollStatus.polling_enabled ? '#064e3b' : '#7f1d1d',
                border: `2px solid ${pollStatus.polling_enabled ? '#10b981' : '#ef4444'}`,
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <span
                      style={{
                        fontSize: '2rem',
                        animation: pollStatus.polling_enabled ? 'pulse 2s infinite' : 'none',
                      }}
                    >
                      {pollStatus.polling_enabled ? '🟢' : '🔴'}
                    </span>
                    <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f1f5f9' }}>
                      Polling {pollStatus.polling_enabled ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                    Polling every {POLLING_INTERVAL_MINUTES} minutes
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    (configured at deployment)
                  </div>
                  {countdown !== null && pollStatus.polling_enabled && (
                    <div
                      style={{
                        color: countdown < 60 ? '#fbbf24' : '#10b981',
                        fontSize: '1rem',
                        marginTop: '0.5rem',
                        fontWeight: '600',
                      }}
                    >
                      Next poll in: {formatCountdown(countdown)}
                    </div>
                  )}
                  {pollStatus.last_poll_timestamp && (
                    <div style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                      Last poll: {new Date(pollStatus.last_poll_timestamp).toLocaleString()}
                    </div>
                  )}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={pollStatus.polling_enabled}
                    onChange={togglePolling}
                    disabled={togglingPolling}
                    style={{
                      width: '3rem',
                      height: '1.5rem',
                      cursor: 'pointer',
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Manual Trigger Button */}
            <button
              style={{
                ...buttonStyle,
                width: '100%',
                marginBottom: '1.5rem',
                backgroundColor: '#6366f1',
              }}
              onClick={triggerManualPoll}
              disabled={triggeringPoll || !pollStatus?.polling_enabled}
            >
              {triggeringPoll ? '⏳ Polling...' : '🔄 Poll Now'}
            </button>

            {/* Stats Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              <div style={cardStyle}>
                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Success Rate (24h)</div>
                <div style={{ color: '#10b981', fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {pollStatus.stats.success_rate_24h}%
                </div>
              </div>
              <div style={cardStyle}>
                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Total Polls (24h)</div>
                <div style={{ color: '#f1f5f9', fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {pollStatus.stats.total_polls_24h}
                </div>
              </div>
              <div style={cardStyle}>
                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Estimates Found (24h)</div>
                <div style={{ color: '#3b82f6', fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {pollStatus.stats.total_estimates_24h}
                </div>
              </div>
              <div style={cardStyle}>
                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Avg Duration</div>
                <div style={{ color: '#f1f5f9', fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {pollStatus.stats.average_duration_ms}ms
                </div>
              </div>
              <div style={cardStyle}>
                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Failed (24h)</div>
                <div style={{ color: '#ef4444', fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {pollStatus.stats.failed_polls_24h}
                </div>
              </div>
              <div style={cardStyle}>
                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Skipped (24h)</div>
                <div style={{ color: '#64748b', fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {pollStatus.stats.skipped_polls_24h}
                </div>
              </div>
            </div>

            {/* Recent Logs */}
            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <h3 style={{ color: '#f1f5f9', fontSize: '1.125rem', fontWeight: '600' }}>
                Recent Polls
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <span style={{ color: '#10b981', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.5rem' }}>🟢</span> Live updates
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Show:</label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1); // Reset to first page
                    }}
                    style={{
                      padding: '0.25rem 0.5rem',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '0.25rem',
                      color: '#f1f5f9',
                      fontSize: '0.875rem',
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
            </div>

            {pollStatus.logs.length === 0 ? (
              <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
                No polling logs yet
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Time</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Found</th>
                        <th style={thStyle}>Processed</th>
                        <th style={thStyle}>Duration</th>
                        <th style={thStyle}>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Calculate pagination
                        const startIndex = (currentPage - 1) * itemsPerPage;
                        const endIndex = startIndex + itemsPerPage;
                        const paginatedLogs = pollStatus.logs.slice(startIndex, endIndex);

                        return paginatedLogs.map((log) => (
                      <>
                        <tr
                          key={log.id}
                          onClick={() => log.estimates_processed > 0 && fetchPollDetails(log.id)}
                          style={{
                            cursor: log.estimates_processed > 0 ? 'pointer' : 'default',
                            backgroundColor: expandedPollId === log.id ? '#334155' : 'transparent',
                          }}
                        >
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              {log.estimates_processed > 0 && (
                                <span style={{ fontSize: '0.875rem' }}>
                                  {expandedPollId === log.id ? '▼' : '▶'}
                                </span>
                              )}
                              <div>
                                <div style={{ fontSize: '0.875rem' }}>
                                  {new Date(log.created_at).toLocaleString()}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                  {(() => {
                                    const now = Date.now();
                                    const logTime = new Date(log.created_at).getTime();
                                    const diff = Math.floor((now - logTime) / 1000);
                                    if (diff < 60) return `${diff}s ago`;
                                    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
                                    return `${Math.floor(diff / 3600)}h ago`;
                                  })()}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={tdStyle}>
                            <span
                              style={{
                                ...tagStyle(true),
                                cursor: 'default',
                                backgroundColor:
                                  log.status === 'success'
                                    ? '#065f46'
                                    : log.status === 'error'
                                    ? '#7f1d1d'
                                    : log.status === 'skipped'
                                    ? '#1e293b'
                                    : '#334155',
                                color:
                                  log.status === 'success'
                                    ? '#10b981'
                                    : log.status === 'error'
                                    ? '#ef4444'
                                    : '#64748b',
                              }}
                            >
                              {log.status.toUpperCase()}
                            </span>
                          </td>
                          <td style={tdStyle}>{log.estimates_found}</td>
                          <td style={tdStyle}>{log.estimates_processed}</td>
                          <td style={tdStyle}>{log.duration_ms}ms</td>
                          <td style={tdStyle}>
                            {log.error_message ? (
                              <span
                                style={{
                                  fontSize: '0.75rem',
                                  color: '#ef4444',
                                  cursor: 'help',
                                }}
                                title={log.error_message}
                              >
                                {log.error_message.substring(0, 30)}...
                              </span>
                            ) : (
                              <span style={{ color: '#64748b' }}>-</span>
                            )}
                          </td>
                        </tr>
                        {expandedPollId === log.id && pollEstimates[log.id] && (
                          <tr key={`${log.id}-details`}>
                            <td colSpan={6} style={{ ...tdStyle, padding: 0, backgroundColor: '#1e293b' }}>
                              <div style={{ padding: '1rem', borderTop: '2px solid #334155' }}>
                                <h4 style={{ color: '#f1f5f9', marginBottom: '1rem', fontSize: '1rem' }}>
                                  Estimates Found ({pollEstimates[log.id].length})
                                </h4>
                                {pollEstimates[log.id].length === 0 ? (
                                  <div style={{ color: '#64748b', textAlign: 'center', padding: '1rem' }}>
                                    No estimates processed during this poll
                                  </div>
                                ) : (
                                  <div style={{ overflowX: 'auto' }}>
                                    <table style={tableStyle}>
                                      <thead>
                                        <tr>
                                          <th style={thStyle}>Estimate ID</th>
                                          <th style={thStyle}>Salesperson</th>
                                          <th style={thStyle}>Customer</th>
                                          <th style={thStyle}>Amount</th>
                                          <th style={thStyle}>Type</th>
                                          <th style={thStyle}>Sold At</th>
                                          <th style={thStyle}>Job #</th>
                                          <th style={thStyle}>Location ID</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {pollEstimates[log.id].map((estimate) => (
                                          <tr key={estimate.id}>
                                            <td style={tdStyle}>{estimate.estimate_id}</td>
                                            <td style={tdStyle}>{estimate.salesperson}</td>
                                            <td style={tdStyle}>{estimate.customer_name}</td>
                                            <td style={tdStyle}>
                                              ${estimate.amount.toLocaleString('en-US', {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                              })}
                                            </td>
                                            <td style={tdStyle}>
                                              {estimate.is_tgl && (
                                                <span
                                                  style={{
                                                    ...tagStyle(true),
                                                    backgroundColor: '#065f46',
                                                    color: '#10b981',
                                                    marginRight: '0.25rem',
                                                  }}
                                                >
                                                  TGL
                                                </span>
                                              )}
                                              {estimate.is_big_sale && (
                                                <span
                                                  style={{
                                                    ...tagStyle(true),
                                                    backgroundColor: '#7c2d12',
                                                    color: '#fb923c',
                                                  }}
                                                >
                                                  BIG SALE
                                                </span>
                                              )}
                                            </td>
                                            <td style={tdStyle}>
                                              {new Date(estimate.sold_at).toLocaleString()}
                                            </td>
                                            <td style={tdStyle}>{estimate.job_number}</td>
                                            <td style={tdStyle}>{estimate.location_id}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {(() => {
                  const totalLogs = pollStatus.logs.length;
                  const totalPages = Math.ceil(totalLogs / itemsPerPage);
                  const startItem = (currentPage - 1) * itemsPerPage + 1;
                  const endItem = Math.min(currentPage * itemsPerPage, totalLogs);

                  return (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '1rem',
                        padding: '0.75rem',
                        backgroundColor: '#1e293b',
                        borderRadius: '0.375rem',
                        flexWrap: 'wrap',
                        gap: '1rem',
                      }}
                    >
                      {/* Info */}
                      <div style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                        Showing {startItem} to {endItem} of {totalLogs} polls
                      </div>

                      {/* Navigation */}
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                          onClick={() => setCurrentPage(1)}
                          disabled={currentPage === 1}
                          style={{
                            padding: '0.5rem 0.75rem',
                            backgroundColor: currentPage === 1 ? '#1e293b' : '#334155',
                            color: currentPage === 1 ? '#64748b' : '#f1f5f9',
                            border: '1px solid #334155',
                            borderRadius: '0.25rem',
                            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                            fontSize: '0.875rem',
                          }}
                        >
                          First
                        </button>
                        <button
                          onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          style={{
                            padding: '0.5rem 0.75rem',
                            backgroundColor: currentPage === 1 ? '#1e293b' : '#334155',
                            color: currentPage === 1 ? '#64748b' : '#f1f5f9',
                            border: '1px solid #334155',
                            borderRadius: '0.25rem',
                            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                            fontSize: '0.875rem',
                          }}
                        >
                          Previous
                        </button>
                        <span style={{ color: '#f1f5f9', fontSize: '0.875rem', padding: '0 0.5rem' }}>
                          Page {currentPage} of {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                          style={{
                            padding: '0.5rem 0.75rem',
                            backgroundColor: currentPage === totalPages ? '#1e293b' : '#334155',
                            color: currentPage === totalPages ? '#64748b' : '#f1f5f9',
                            border: '1px solid #334155',
                            borderRadius: '0.25rem',
                            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                            fontSize: '0.875rem',
                          }}
                        >
                          Next
                        </button>
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          disabled={currentPage === totalPages}
                          style={{
                            padding: '0.5rem 0.75rem',
                            backgroundColor: currentPage === totalPages ? '#1e293b' : '#334155',
                            color: currentPage === totalPages ? '#64748b' : '#f1f5f9',
                            border: '1px solid #334155',
                            borderRadius: '0.25rem',
                            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                            fontSize: '0.875rem',
                          }}
                        >
                          Last
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            {/* Clear Testing Data Button */}
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #334155' }}>
              <button
                onClick={() => setShowClearConfirm(true)}
                disabled={clearingData}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#ea580c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: clearingData ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  opacity: clearingData ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
                onMouseEnter={(e) => {
                  if (!clearingData) {
                    e.currentTarget.style.backgroundColor = '#dc2626';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ea580c';
                }}
              >
                <span style={{ fontSize: '1.125rem' }}>🗑️</span>
                {clearingData ? 'Clearing...' : 'Clear Testing Data'}
              </button>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem', maxWidth: '600px' }}>
                Clears all estimates, poll logs, and webhook logs. Use this to test the system with fresh sales data.
                Your messages, GIFs, salespeople, and settings will remain intact.
              </div>
            </div>
          </>
        ) : (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
            Loading polling status...
          </div>
        )}
      </div>

      {/* Webhook Modal */}
      {showWebhookModal && (
        <div style={modalOverlayStyle} onClick={() => setShowWebhookModal(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: '#f1f5f9', marginBottom: '1.5rem' }}>
              {editingWebhook ? 'Edit Webhook' : 'Add Webhook'}
            </h2>

            {webhookFormError && (
              <div
                style={{
                  backgroundColor: '#7f1d1d',
                  color: '#fecaca',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  marginBottom: '1rem',
                }}
              >
                {webhookFormError}
              </div>
            )}

            <label style={labelStyle}>Webhook Name</label>
            <input
              type="text"
              style={inputStyle}
              value={webhookForm.name}
              onChange={(e) => setWebhookForm({ ...webhookForm, name: e.target.value })}
              placeholder="e.g., Sales Team Chat"
            />

            <label style={labelStyle}>Google Chat Webhook URL</label>
            <input
              type="text"
              style={inputStyle}
              value={webhookForm.url}
              onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })}
              placeholder="https://chat.googleapis.com/v1/spaces/..."
            />

            <label style={labelStyle}>Celebration Types</label>
            <div style={{ marginBottom: '1rem' }}>
              <span
                style={tagStyle(webhookForm.tags.includes('tgl'))}
                onClick={() => {
                  const tags = webhookForm.tags.includes('tgl')
                    ? webhookForm.tags.filter((t) => t !== 'tgl')
                    : [...webhookForm.tags, 'tgl'];
                  setWebhookForm({ ...webhookForm, tags });
                }}
              >
                TGL
              </span>
              <span
                style={tagStyle(webhookForm.tags.includes('big_sale'))}
                onClick={() => {
                  const tags = webhookForm.tags.includes('big_sale')
                    ? webhookForm.tags.filter((t) => t !== 'big_sale')
                    : [...webhookForm.tags, 'big_sale'];
                  setWebhookForm({ ...webhookForm, tags });
                }}
              >
                Big Sale
              </span>
            </div>

            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={webhookForm.is_active}
                onChange={(e) =>
                  setWebhookForm({ ...webhookForm, is_active: e.target.checked })
                }
                style={{ marginRight: '0.5rem' }}
              />
              Active
            </label>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button
                style={{ ...buttonStyle, flex: 1 }}
                onClick={handleSaveWebhook}
              >
                {editingWebhook ? 'Save Changes' : 'Add Webhook'}
              </button>
              <button
                style={{ ...secondaryButtonStyle, flex: 1 }}
                onClick={() => setShowWebhookModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {showLogsModal && (
        <div style={modalOverlayStyle} onClick={() => setShowLogsModal(false)}>
          <div
            style={{ ...modalStyle, maxWidth: '800px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: '#f1f5f9', marginBottom: '1rem' }}>Delivery Logs</h2>

            {logsSummary && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '1rem',
                  marginBottom: '1.5rem',
                }}
              >
                <div style={cardStyle}>
                  <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Total</div>
                  <div style={{ color: '#f1f5f9', fontSize: '1.5rem', fontWeight: 'bold' }}>
                    {logsSummary.total}
                  </div>
                </div>
                <div style={cardStyle}>
                  <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Success</div>
                  <div style={{ color: '#10b981', fontSize: '1.5rem', fontWeight: 'bold' }}>
                    {logsSummary.success}
                  </div>
                </div>
                <div style={cardStyle}>
                  <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Failed</div>
                  <div style={{ color: '#ef4444', fontSize: '1.5rem', fontWeight: 'bold' }}>
                    {logsSummary.failed}
                  </div>
                </div>
                <div style={cardStyle}>
                  <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Success Rate</div>
                  <div style={{ color: '#f1f5f9', fontSize: '1.5rem', fontWeight: 'bold' }}>
                    {logsSummary.success_rate}%
                  </div>
                </div>
              </div>
            )}

            {logs.length === 0 ? (
              <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
                No delivery logs yet
              </div>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Time</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td style={tdStyle}>
                        {new Date(log.sent_at).toLocaleString()}
                      </td>
                      <td style={tdStyle}>
                        <span style={tagStyle(true)}>
                          {log.celebration_type === 'tgl' ? 'TGL' : 'Big Sale'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            color: log.status === 'success' ? '#10b981' : '#ef4444',
                            fontWeight: '600',
                          }}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {log.error_message ? (
                          <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>
                            {log.error_message}
                          </span>
                        ) : (
                          <span style={{ color: '#64748b' }}>-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <button
              style={{ ...buttonStyle, width: '100%', marginTop: '1rem' }}
              onClick={() => setShowLogsModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div style={modalOverlayStyle} onClick={() => setShowClearConfirm(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: '#f1f5f9', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '2rem' }}>⚠️</span>
              Clear Testing Data?
            </h2>

            <div style={{ backgroundColor: '#7f1d1d', color: '#fecaca', padding: '1rem', borderRadius: '6px', marginBottom: '1.5rem' }}>
              <strong>Warning:</strong> This action cannot be undone!
            </div>

            <div style={{ color: '#cbd5e1', marginBottom: '1.5rem', lineHeight: '1.6' }}>
              <p style={{ marginBottom: '1rem' }}>This will permanently delete:</p>
              <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                <li>All estimates (sales records)</li>
                <li>All poll logs (polling history)</li>
                <li>All webhook logs (Google Chat delivery history)</li>
              </ul>
              <p style={{ marginBottom: '1rem' }}>
                <strong style={{ color: '#fbbf24' }}>This will be reset:</strong>
              </p>
              <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                <li>Recently processed IDs (cleared)</li>
                <li>Last poll timestamp (reset to 12:01 AM today)</li>
                <li>Message usage statistics (reset to 0)</li>
                <li>GIF usage statistics (reset to 0)</li>
              </ul>
              <p style={{ marginBottom: '1rem' }}>
                <strong style={{ color: '#10b981' }}>These will remain intact:</strong>
              </p>
              <ul style={{ paddingLeft: '1.5rem' }}>
                <li>Messages and GIFs</li>
                <li>Salespeople</li>
                <li>Webhook configurations</li>
                <li>All settings</li>
              </ul>
              <p style={{ marginTop: '1rem', fontStyle: 'italic', color: '#94a3b8' }}>
                The next poll will find all of today's sales and send them to Google Chat.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                style={{
                  ...buttonStyle,
                  flex: 1,
                  backgroundColor: '#334155',
                }}
                onClick={() => setShowClearConfirm(false)}
                disabled={clearingData}
              >
                Cancel
              </button>
              <button
                style={{
                  ...buttonStyle,
                  flex: 1,
                  backgroundColor: '#dc2626',
                }}
                onClick={clearTestingData}
                disabled={clearingData}
              >
                {clearingData ? 'Clearing...' : 'Yes, Clear All Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add pulse animation for polling status indicator */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}
