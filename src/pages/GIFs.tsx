import { useState, useEffect } from 'react'

interface GIF {
  id: number
  name: string
  url: string
  tags: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

function GIFs() {
  const [gifs, setGifs] = useState<GIF[]>([])
  const [filteredGifs, setFilteredGifs] = useState<GIF[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterTag, setFilterTag] = useState<'all' | 'tgl' | 'big_sale' | 'both'>('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingGif, setEditingGif] = useState<GIF | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    tags: [] as string[],
    is_active: true,
  })
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    fetchGifs()
  }, [])

  useEffect(() => {
    applyFilter()
  }, [gifs, filterTag])

  const fetchGifs = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/.netlify/functions/gifs')
      if (!response.ok) throw new Error('Failed to fetch GIFs')
      const data = await response.json()
      setGifs(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const applyFilter = () => {
    let filtered = gifs

    if (filterTag === 'tgl') {
      filtered = gifs.filter((g) => g.tags.includes('tgl') && !g.tags.includes('big_sale'))
    } else if (filterTag === 'big_sale') {
      filtered = gifs.filter((g) => g.tags.includes('big_sale') && !g.tags.includes('tgl'))
    } else if (filterTag === 'both') {
      filtered = gifs.filter((g) => g.tags.includes('tgl') && g.tags.includes('big_sale'))
    }

    setFilteredGifs(filtered)
  }

  const openAddModal = () => {
    setEditingGif(null)
    setFormData({ name: '', url: '', tags: [], is_active: true })
    setPreviewUrl('')
    setIsModalOpen(true)
  }

  const openEditModal = (gif: GIF) => {
    setEditingGif(gif)
    setFormData({
      name: gif.name,
      url: gif.url,
      tags: [...gif.tags],
      is_active: gif.is_active,
    })
    setPreviewUrl(gif.url)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingGif(null)
    setFormData({ name: '', url: '', tags: [], is_active: true })
    setPreviewUrl('')
  }

  const loadPreview = () => {
    if (formData.url.trim()) {
      setPreviewLoading(true)
      setPreviewUrl(formData.url)
      // Give image time to load
      setTimeout(() => setPreviewLoading(false), 1000)
    }
  }

  const toggleTag = (tag: string) => {
    if (formData.tags.includes(tag)) {
      setFormData({ ...formData, tags: formData.tags.filter((t) => t !== tag) })
    } else {
      setFormData({ ...formData, tags: [...formData.tags, tag] })
    }
  }

  const saveGif = async () => {
    try {
      if (!formData.name.trim()) {
        alert('Name is required')
        return
      }

      if (!formData.url.trim()) {
        alert('URL is required')
        return
      }

      if (formData.tags.length === 0) {
        alert('Please select at least one tag (TGL or Big Sale)')
        return
      }

      if (editingGif) {
        // Update
        const response = await fetch(`/.netlify/functions/gifs/${editingGif.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to update GIF')
        }
        const updated = await response.json()
        setGifs((prev) => prev.map((g) => (g.id === updated.id ? updated : g)))
      } else {
        // Create
        const response = await fetch('/.netlify/functions/gifs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to create GIF')
        }
        const newGif = await response.json()
        setGifs((prev) => [newGif, ...prev])
      }

      closeModal()
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    }
  }

  const deleteGif = async (id: number) => {
    if (!confirm('Are you sure you want to delete this GIF?')) return

    try {
      const response = await fetch(`/.netlify/functions/gifs/${id}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete GIF')
      }

      setGifs((prev) => prev.filter((g) => g.id !== id))
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#94a3b8' }}>Loading GIFs...</p>
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
        <h2 style={{ fontSize: '2rem', fontWeight: 'bold' }}>GIF Catalog</h2>
        <button
          onClick={openAddModal}
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
          + Add New GIF
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

      {/* Filter */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem' }}>
        {[
          { value: 'all', label: 'Show All' },
          { value: 'tgl', label: 'TGL Only' },
          { value: 'big_sale', label: 'Big Sale Only' },
          { value: 'both', label: 'Both' },
        ].map((filter) => (
          <button
            key={filter.value}
            onClick={() => setFilterTag(filter.value as any)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: filterTag === filter.value ? '#3b82f6' : '#334155',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{
        backgroundColor: '#1e293b',
        borderRadius: '0.5rem',
        overflow: 'hidden',
        border: '1px solid #334155',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#334155' }}>
              <th style={{ ...tableHeaderStyle, width: '100px' }}>Thumbnail</th>
              <th style={tableHeaderStyle}>Name</th>
              <th style={tableHeaderStyle}>URL</th>
              <th style={{ ...tableHeaderStyle, width: '150px' }}>Tags</th>
              <th style={{ ...tableHeaderStyle, width: '80px' }}>Active</th>
              <th style={{ ...tableHeaderStyle, width: '150px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredGifs.map((gif) => (
              <tr key={gif.id} style={{ borderBottom: '1px solid #334155' }}>
                <td style={{ ...tableCellStyle, textAlign: 'center' }}>
                  <img
                    src={gif.url}
                    alt={gif.name}
                    style={{
                      width: '80px',
                      height: '80px',
                      objectFit: 'cover',
                      borderRadius: '0.375rem',
                      border: '2px solid #475569',
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect fill="%23334155" width="80" height="80"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-size="12"%3EError%3C/text%3E%3C/svg%3E'
                    }}
                  />
                </td>
                <td style={tableCellStyle}>{gif.name}</td>
                <td style={{ ...tableCellStyle, maxWidth: '300px' }}>
                  <a
                    href={gif.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#3b82f6',
                      textDecoration: 'none',
                      fontSize: '0.75rem',
                      wordBreak: 'break-all',
                    }}
                  >
                    {gif.url.length > 50 ? gif.url.substring(0, 50) + '...' : gif.url}
                  </a>
                </td>
                <td style={tableCellStyle}>
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {gif.tags.includes('tgl') && (
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        backgroundColor: '#1e40af',
                        color: '#93c5fd',
                      }}>
                        TGL
                      </span>
                    )}
                    {gif.tags.includes('big_sale') && (
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        backgroundColor: '#065f46',
                        color: '#6ee7b7',
                      }}>
                        Big Sale
                      </span>
                    )}
                  </div>
                </td>
                <td style={tableCellStyle}>
                  <span style={{
                    fontSize: '0.75rem',
                    color: gif.is_active ? '#6ee7b7' : '#f87171',
                    fontWeight: '600',
                  }}>
                    {gif.is_active ? '●' : '○'}
                  </span>
                </td>
                <td style={tableCellStyle}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => openEditModal(gif)}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteGif(gif.id)}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        backgroundColor: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredGifs.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            No GIFs found. {filterTag !== 'all' && 'Try changing the filter or '}Click "Add New GIF" to create one.
          </div>
        )}
      </div>

      <div style={{ marginTop: '1rem', color: '#64748b', fontSize: '0.875rem' }}>
        Showing {filteredGifs.length} of {gifs.length} GIFs
      </div>

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
              {editingGif ? 'Edit GIF' : 'Add New GIF'}
            </h3>

            {/* Name */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: '#cbd5e1' }}>
                Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Celebration Dance"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  backgroundColor: '#0f172a',
                  color: '#f1f5f9',
                  border: '1px solid #475569',
                  borderRadius: '0.375rem',
                }}
              />
            </div>

            {/* URL */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: '#cbd5e1' }}>
                URL
              </label>
              <input
                type="text"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://example.com/image.gif"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  backgroundColor: '#0f172a',
                  color: '#f1f5f9',
                  border: '1px solid #475569',
                  borderRadius: '0.375rem',
                }}
              />
              <button
                onClick={loadPreview}
                style={{
                  marginTop: '0.5rem',
                  padding: '0.375rem 0.75rem',
                  backgroundColor: '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: '500',
                }}
              >
                Load Preview
              </button>
            </div>

            {/* Preview */}
            {previewUrl && (
              <div style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                backgroundColor: '#0f172a',
                borderRadius: '0.375rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                  Preview:
                </div>
                {previewLoading ? (
                  <div style={{ color: '#94a3b8' }}>Loading...</div>
                ) : (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '200px',
                      borderRadius: '0.375rem',
                      border: '2px solid #475569',
                    }}
                    onError={() => {
                      alert('Failed to load GIF. Please check the URL.')
                      setPreviewUrl('')
                    }}
                  />
                )}
              </div>
            )}

            {/* Tags */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: '#cbd5e1' }}>
                Tags (select at least one)
              </label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.tags.includes('tgl')}
                    onChange={() => toggleTag('tgl')}
                    style={{ marginRight: '0.5rem', cursor: 'pointer', width: '1.25rem', height: '1.25rem' }}
                  />
                  <span style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Use for TGLs</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.tags.includes('big_sale')}
                    onChange={() => toggleTag('big_sale')}
                    style={{ marginRight: '0.5rem', cursor: 'pointer', width: '1.25rem', height: '1.25rem' }}
                  />
                  <span style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>Use for Big Sales</span>
                </label>
              </div>
            </div>

            {/* Active */}
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
                onClick={saveGif}
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
                {editingGif ? 'Save Changes' : 'Create GIF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const tableHeaderStyle: React.CSSProperties = {
  padding: '1rem',
  textAlign: 'left',
  fontSize: '0.875rem',
  fontWeight: '600',
  textTransform: 'uppercase',
  color: '#cbd5e1',
}

const tableCellStyle: React.CSSProperties = {
  padding: '1rem',
  fontSize: '0.875rem',
  color: '#e2e8f0',
}

export default GIFs
