import { useState, useEffect } from 'react'

interface Message {
  id: number
  message_text: string
  category: 'big_sale' | 'tgl'
  is_active: boolean
  created_at: string
  updated_at: string
}

const SAMPLE_NAME = 'Richard Sinnott'
const SAMPLE_AMOUNT = '1,234.56'

function Messages() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'big_sale' | 'tgl'>('big_sale')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  const [formData, setFormData] = useState({
    message_text: '',
    category: 'big_sale' as 'big_sale' | 'tgl',
    is_active: true,
  })

  useEffect(() => {
    fetchMessages()
  }, [])

  const fetchMessages = async () => {
    try {
      setLoading(true)
      setError(null)

      // Check and run migration if needed
      const migrationResponse = await fetch('/.netlify/functions/migrate-content', {
        method: 'POST',
      })
      await migrationResponse.json()

      const response = await fetch('/.netlify/functions/messages')
      if (!response.ok) throw new Error('Failed to fetch messages')
      const data = await response.json()
      setMessages(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const openAddModal = (category: 'big_sale' | 'tgl') => {
    setEditingMessage(null)
    setFormData({
      message_text: '',
      category,
      is_active: true,
    })
    setIsModalOpen(true)
  }

  const openEditModal = (message: Message) => {
    setEditingMessage(message)
    setFormData({
      message_text: message.message_text,
      category: message.category,
      is_active: message.is_active,
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingMessage(null)
    setFormData({ message_text: '', category: 'big_sale', is_active: true })
  }

  const insertPlaceholder = (placeholder: string) => {
    const textarea = document.querySelector('textarea[name="message_text"]') as HTMLTextAreaElement
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const text = formData.message_text
      const newText = text.substring(0, start) + placeholder + text.substring(end)
      setFormData({ ...formData, message_text: newText })

      // Set cursor after inserted placeholder
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + placeholder.length, start + placeholder.length)
      }, 0)
    }
  }

  const saveMessage = async () => {
    try {
      if (formData.message_text.trim().length === 0) {
        alert('Message text cannot be empty')
        return
      }

      if (formData.message_text.length > 500) {
        alert('Message must be 500 characters or less')
        return
      }

      if (editingMessage) {
        // Update existing
        const response = await fetch(`/.netlify/functions/messages/${editingMessage.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })
        if (!response.ok) throw new Error('Failed to update message')
        const updated = await response.json()
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      } else {
        // Create new
        const response = await fetch('/.netlify/functions/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })
        if (!response.ok) throw new Error('Failed to create message')
        const newMessage = await response.json()
        setMessages((prev) => [newMessage, ...prev])
      }

      closeModal()
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    }
  }

  const deleteMessage = async (id: number) => {
    if (!confirm('Are you sure you want to delete this message?')) return

    try {
      const response = await fetch(`/.netlify/functions/messages/${id}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete message')
      }

      setMessages((prev) => prev.filter((m) => m.id !== id))
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    }
  }

  const renderPreview = (text: string) => {
    return text.replace(/{name}/g, SAMPLE_NAME).replace(/{amount}/g, SAMPLE_AMOUNT)
  }

  const filteredMessages = messages.filter((m) => m.category === activeTab)

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#94a3b8' }}>Loading messages...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Message Templates</h2>
        <button
          onClick={() => openAddModal(activeTab)}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#22c55e',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: '500',
          }}
        >
          + Add New Message
        </button>
      </div>

      {error && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#7f1d1d',
          color: '#fecaca',
          borderRadius: '0.375rem',
          marginBottom: '1rem'
        }}>
          Error: {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ marginBottom: '2rem', borderBottom: '2px solid #334155' }}>
        <button
          onClick={() => setActiveTab('big_sale')}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: 'transparent',
            color: activeTab === 'big_sale' ? '#3b82f6' : '#94a3b8',
            border: 'none',
            borderBottom: activeTab === 'big_sale' ? '2px solid #3b82f6' : '2px solid transparent',
            marginBottom: '-2px',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: '600',
          }}
        >
          Big Sale Messages ({messages.filter((m) => m.category === 'big_sale').length})
        </button>
        <button
          onClick={() => setActiveTab('tgl')}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: 'transparent',
            color: activeTab === 'tgl' ? '#3b82f6' : '#94a3b8',
            border: 'none',
            borderBottom: activeTab === 'tgl' ? '2px solid #3b82f6' : '2px solid transparent',
            marginBottom: '-2px',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: '600',
          }}
        >
          TGL Messages ({messages.filter((m) => m.category === 'tgl').length})
        </button>
      </div>

      {/* Message Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
        gap: '1.5rem'
      }}>
        {filteredMessages.map((message) => (
          <div
            key={message.id}
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              border: '1px solid #334155',
            }}
          >
            <div style={{ marginBottom: '1rem' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '0.75rem'
              }}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    backgroundColor: message.category === 'big_sale' ? '#065f46' : '#1e40af',
                    color: message.category === 'big_sale' ? '#6ee7b7' : '#93c5fd',
                  }}
                >
                  {message.category === 'big_sale' ? 'Big Sale' : 'TGL'}
                </span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: message.is_active ? '#6ee7b7' : '#f87171',
                    fontWeight: '600',
                  }}
                >
                  {message.is_active ? '● Active' : '○ Inactive'}
                </span>
              </div>

              <div style={{
                fontSize: '0.875rem',
                color: '#e2e8f0',
                lineHeight: '1.5',
                marginBottom: '1rem',
                wordWrap: 'break-word',
              }}>
                {message.message_text.split(/(\{name\}|\{amount\})/g).map((part, i) => {
                  if (part === '{name}' || part === '{amount}') {
                    return (
                      <span
                        key={i}
                        style={{
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                        }}
                      >
                        {part}
                      </span>
                    )
                  }
                  return part
                })}
              </div>

              <div style={{
                padding: '0.75rem',
                backgroundColor: '#0f172a',
                borderRadius: '0.375rem',
                borderLeft: '3px solid #3b82f6',
              }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                  Preview:
                </div>
                <div style={{ fontSize: '0.875rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                  {renderPreview(message.message_text)}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => openEditModal(message)}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                }}
              >
                Edit
              </button>
              <button
                onClick={() => deleteMessage(message.id)}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredMessages.length === 0 && (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          color: '#64748b',
          backgroundColor: '#1e293b',
          borderRadius: '0.5rem',
          border: '1px solid #334155',
        }}>
          No {activeTab === 'big_sale' ? 'Big Sale' : 'TGL'} messages found. Click "Add New Message" to create one.
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '0.5rem',
            padding: '2rem',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto',
            border: '1px solid #334155',
          }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
              {editingMessage ? 'Edit Message' : 'Add New Message'}
            </h3>

            {/* Category */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: '#cbd5e1' }}>
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as 'big_sale' | 'tgl' })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  backgroundColor: '#0f172a',
                  color: '#f1f5f9',
                  border: '1px solid #475569',
                  borderRadius: '0.375rem',
                }}
              >
                <option value="big_sale">Big Sale</option>
                <option value="tgl">TGL</option>
              </select>
            </div>

            {/* Message Text */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: '#cbd5e1' }}>
                Message Text
              </label>
              <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => insertPlaceholder('{name}')}
                  style={{
                    padding: '0.375rem 0.75rem',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                  }}
                >
                  Insert {'{name}'}
                </button>
                <button
                  onClick={() => insertPlaceholder('{amount}')}
                  style={{
                    padding: '0.375rem 0.75rem',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                  }}
                >
                  Insert {'{amount}'}
                </button>
              </div>
              <textarea
                name="message_text"
                value={formData.message_text}
                onChange={(e) => setFormData({ ...formData, message_text: e.target.value })}
                rows={5}
                placeholder="Enter your message template here..."
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#0f172a',
                  color: '#f1f5f9',
                  border: '1px solid #475569',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  resize: 'vertical',
                }}
              />
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: formData.message_text.length > 500 ? '#f87171' : '#64748b',
                marginTop: '0.25rem',
              }}>
                <span>Use {'{name}'} and {'{amount}'} as placeholders</span>
                <span>{formData.message_text.length} / 500</span>
              </div>
            </div>

            {/* Preview */}
            {formData.message_text && (
              <div style={{
                padding: '1rem',
                backgroundColor: '#0f172a',
                borderRadius: '0.375rem',
                borderLeft: '3px solid #3b82f6',
                marginBottom: '1.5rem',
              }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                  Preview:
                </div>
                <div style={{ fontSize: '0.875rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                  {renderPreview(formData.message_text)}
                </div>
              </div>
            )}

            {/* Active Toggle */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  style={{ marginRight: '0.5rem', cursor: 'pointer', width: '1.25rem', height: '1.25rem' }}
                />
                <span style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Active</span>
              </label>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={closeModal}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#475569',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveMessage}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                }}
              >
                {editingMessage ? 'Save Changes' : 'Create Message'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Messages
