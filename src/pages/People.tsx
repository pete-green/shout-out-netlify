import { useState, useEffect } from 'react'

const BUSINESS_UNITS = [
  'Plumbing Service',
  'Plumbing Install',
  'HVAC Service',
  'HVAC Install',
  'Electrical Service',
  'Electrical Install',
  'Inside Sales',
  'Office',
  'Apprentice',
  'Other',
]

const SALES_UNITS = [
  'Plumbing Service',
  'Plumbing Install',
  'HVAC Service',
  'HVAC Install',
  'Electrical Service',
  'Electrical Install',
  'Inside Sales',
]

interface Salesperson {
  id: number
  technician_id: number
  name: string
  email: string | null
  phone: string | null
  st_active: boolean
  business_unit: string | null
  headshot_url: string | null
  is_active: boolean
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

type SortField = 'name' | 'email' | 'business_unit' | 'is_active'
type SortDirection = 'asc' | 'desc'

function People() {
  const [salespeople, setSalespeople] = useState<Salesperson[]>([])
  const [filteredPeople, setFilteredPeople] = useState<Salesperson[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({
    business_unit: '',
    headshot_url: '',
    is_active: true,
  })

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Filter state - default: sales units + unassigned
  const [showUnassigned, setShowUnassigned] = useState(true)
  const [visibleUnits, setVisibleUnits] = useState<Set<string>>(new Set(SALES_UNITS))
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false)

  // Fetch salespeople on mount
  useEffect(() => {
    fetchSalespeople()
  }, [])

  // Apply filtering and sorting whenever data or filters change
  useEffect(() => {
    let filtered = [...salespeople]

    // Apply business unit filter
    filtered = filtered.filter((person) => {
      if (person.business_unit === null) {
        return showUnassigned
      }
      return visibleUnits.has(person.business_unit)
    })

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any = a[sortField]
      let bValue: any = b[sortField]

      // Handle null values
      if (aValue === null) aValue = ''
      if (bValue === null) bValue = ''

      // Convert to lowercase for string comparisons
      if (typeof aValue === 'string') aValue = aValue.toLowerCase()
      if (typeof bValue === 'string') bValue = bValue.toLowerCase()

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    setFilteredPeople(filtered)
  }, [salespeople, visibleUnits, showUnassigned, sortField, sortDirection])

  const fetchSalespeople = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/.netlify/functions/salespeople')
      if (!response.ok) {
        throw new Error('Failed to fetch people')
      }
      const data = await response.json()
      setSalespeople(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const syncSalespeople = async () => {
    try {
      setSyncing(true)
      setError(null)
      const response = await fetch('/.netlify/functions/sync-salespeople', {
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error('Failed to sync people')
      }
      const result = await response.json()
      alert(`Sync completed! ${result.synced} people synced.`)
      fetchSalespeople() // Refresh list
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // New field, default to ascending
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const toggleBusinessUnit = (unit: string) => {
    const newVisibleUnits = new Set(visibleUnits)
    if (newVisibleUnits.has(unit)) {
      newVisibleUnits.delete(unit)
    } else {
      newVisibleUnits.add(unit)
    }
    setVisibleUnits(newVisibleUnits)
  }

  const startEdit = (person: Salesperson) => {
    setEditingId(person.id)
    setEditForm({
      business_unit: person.business_unit || '',
      headshot_url: person.headshot_url || '',
      is_active: person.is_active,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({ business_unit: '', headshot_url: '', is_active: true })
  }

  const saveEdit = async (id: number) => {
    try {
      const response = await fetch(`/.netlify/functions/salespeople/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm),
      })
      if (!response.ok) {
        throw new Error('Failed to update person')
      }
      const updated = await response.json()
      setSalespeople((prev) =>
        prev.map((person) => (person.id === id ? updated : person))
      )
      setEditingId(null)
    } catch (err: any) {
      setError(err.message)
    }
  }

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? ' ↑' : ' ↓'
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#94a3b8' }}>Loading people...</p>
      </div>
    )
  }

  const unassignedCount = salespeople.filter((p) => !p.business_unit).length

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div>
          <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            People Management
          </h2>
          {unassignedCount > 0 && (
            <p style={{ color: '#f59e0b', fontSize: '0.875rem' }}>
              ⚠️ {unassignedCount} {unassignedCount === 1 ? 'person' : 'people'} without business unit assigned
            </p>
          )}
        </div>
        <button
          onClick={syncSalespeople}
          disabled={syncing}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: syncing ? '#475569' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: syncing ? 'not-allowed' : 'pointer',
            fontSize: '1rem',
            fontWeight: '500',
          }}
        >
          {syncing ? 'Syncing...' : '🔄 Sync from ServiceTitan'}
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

      {/* Filter Controls */}
      <div style={{ marginBottom: '1rem', position: 'relative' }}>
        <button
          onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#334155',
            color: '#f1f5f9',
            border: '1px solid #475569',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500',
          }}
        >
          🔽 Filter Business Units ({visibleUnits.size + (showUnassigned ? 1 : 0)}/{BUSINESS_UNITS.length + 1})
        </button>

        {filterDropdownOpen && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '0.5rem',
            backgroundColor: '#1e293b',
            border: '1px solid #475569',
            borderRadius: '0.375rem',
            padding: '1rem',
            zIndex: 10,
            minWidth: '250px',
            maxHeight: '400px',
            overflowY: 'auto',
          }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.875rem' }}>
                <input
                  type="checkbox"
                  checked={showUnassigned}
                  onChange={(e) => setShowUnassigned(e.target.checked)}
                  style={{ marginRight: '0.5rem', cursor: 'pointer' }}
                />
                <span style={{ color: showUnassigned ? '#f1f5f9' : '#94a3b8' }}>
                  Unassigned ({unassignedCount})
                </span>
              </label>
            </div>

            <div style={{ borderTop: '1px solid #475569', paddingTop: '0.75rem' }}>
              {BUSINESS_UNITS.map((unit) => (
                <div key={unit} style={{ marginBottom: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.875rem' }}>
                    <input
                      type="checkbox"
                      checked={visibleUnits.has(unit)}
                      onChange={() => toggleBusinessUnit(unit)}
                      style={{ marginRight: '0.5rem', cursor: 'pointer' }}
                    />
                    <span style={{ color: visibleUnits.has(unit) ? '#f1f5f9' : '#94a3b8' }}>
                      {unit}
                    </span>
                  </label>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px solid #475569', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
              <button
                onClick={() => setFilterDropdownOpen(false)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{
        backgroundColor: '#1e293b',
        borderRadius: '0.5rem',
        overflow: 'hidden',
        border: '1px solid #334155'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#334155' }}>
              <th
                onClick={() => handleSort('name')}
                style={{ ...tableHeaderStyle, cursor: 'pointer', userSelect: 'none' }}
              >
                Name{renderSortIcon('name')}
              </th>
              <th
                onClick={() => handleSort('email')}
                style={{ ...tableHeaderStyle, cursor: 'pointer', userSelect: 'none' }}
              >
                Email{renderSortIcon('email')}
              </th>
              <th
                onClick={() => handleSort('business_unit')}
                style={{ ...tableHeaderStyle, cursor: 'pointer', userSelect: 'none' }}
              >
                Business Unit{renderSortIcon('business_unit')}
              </th>
              <th style={tableHeaderStyle}>Headshot</th>
              <th
                onClick={() => handleSort('is_active')}
                style={{ ...tableHeaderStyle, cursor: 'pointer', userSelect: 'none' }}
              >
                Active{renderSortIcon('is_active')}
              </th>
              <th style={tableHeaderStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPeople.map((person) => {
              const isEditing = editingId === person.id

              return (
                <tr key={person.id} style={{ borderBottom: '1px solid #334155' }}>
                  <td style={tableCellStyle}>
                    <div>
                      <div style={{ fontWeight: '500' }}>{person.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        ID: {person.technician_id}
                      </div>
                    </div>
                  </td>
                  <td style={tableCellStyle}>
                    {person.email || <span style={{ color: '#64748b' }}>—</span>}
                  </td>
                  <td style={tableCellStyle}>
                    {isEditing ? (
                      <select
                        value={editForm.business_unit}
                        onChange={(e) =>
                          setEditForm({ ...editForm, business_unit: e.target.value })
                        }
                        style={{
                          padding: '0.5rem',
                          backgroundColor: '#0f172a',
                          color: '#f1f5f9',
                          border: '1px solid #475569',
                          borderRadius: '0.25rem',
                          width: '100%',
                        }}
                      >
                        <option value="">Select...</option>
                        {BUSINESS_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    ) : person.business_unit ? (
                      person.business_unit
                    ) : (
                      <span style={{ color: '#f59e0b', fontWeight: '600' }}>Not set</span>
                    )}
                  </td>
                  <td style={tableCellStyle}>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.headshot_url}
                        onChange={(e) =>
                          setEditForm({ ...editForm, headshot_url: e.target.value })
                        }
                        placeholder="https://..."
                        style={{
                          padding: '0.5rem',
                          backgroundColor: '#0f172a',
                          color: '#f1f5f9',
                          border: '1px solid #475569',
                          borderRadius: '0.25rem',
                          width: '100%',
                        }}
                      />
                    ) : person.headshot_url ? (
                      <a
                        href={person.headshot_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#3b82f6' }}
                      >
                        View
                      </a>
                    ) : (
                      <span style={{ color: '#64748b' }}>Not set</span>
                    )}
                  </td>
                  <td style={tableCellStyle}>
                    {isEditing ? (
                      <input
                        type="checkbox"
                        checked={editForm.is_active}
                        onChange={(e) =>
                          setEditForm({ ...editForm, is_active: e.target.checked })
                        }
                        style={{ width: '1.25rem', height: '1.25rem', cursor: 'pointer' }}
                      />
                    ) : (
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          backgroundColor: person.is_active ? '#065f46' : '#7f1d1d',
                          color: person.is_active ? '#6ee7b7' : '#fecaca',
                        }}
                      >
                        {person.is_active ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </td>
                  <td style={tableCellStyle}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => saveEdit(person.id)}
                          style={{
                            ...actionButtonStyle,
                            backgroundColor: '#22c55e',
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          style={{
                            ...actionButtonStyle,
                            backgroundColor: '#64748b',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(person)}
                        style={{
                          ...actionButtonStyle,
                          backgroundColor: '#3b82f6',
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filteredPeople.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            {salespeople.length === 0
              ? 'No people found. Click "Sync from ServiceTitan" to import.'
              : 'No people match the current filters.'}
          </div>
        )}
      </div>

      <div style={{ marginTop: '1rem', color: '#64748b', fontSize: '0.875rem' }}>
        Showing {filteredPeople.length} of {salespeople.length} people
      </div>
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

const actionButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  color: 'white',
  border: 'none',
  borderRadius: '0.25rem',
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontWeight: '500',
}

export default People
