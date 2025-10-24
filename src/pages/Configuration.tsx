import { useState, useEffect } from 'react';

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

export default function Configuration() {
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

  useEffect(() => {
    fetchData();
  }, []);

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

        <div style={cardStyle}>
          <label style={labelStyle}>Polling Interval (minutes)</label>
          <input
            type="number"
            style={inputStyle}
            value={settingsForm.polling_interval_minutes}
            onChange={(e) =>
              setSettingsForm({
                ...settingsForm,
                polling_interval_minutes: parseInt(e.target.value) || 1,
              })
            }
            min="1"
            max="60"
          />
          <div style={{ color: '#64748b', fontSize: '0.875rem' }}>
            How often to check for new sales (1-60 minutes)
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
    </div>
  );
}
