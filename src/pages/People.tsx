import { useState, useEffect } from 'react'
import { useIsMobile } from '../hooks/useDeviceType'
import mobileStyles from './PeopleMobile.module.css'

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
  gender: string | null
  is_active: boolean
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

type SortField = 'name' | 'email' | 'business_unit' | 'is_active'
type SortDirection = 'asc' | 'desc'

function People() {
  const isMobile = useIsMobile()
  const [salespeople, setSalespeople] = useState<Salesperson[]>([])
  const [filteredPeople, setFilteredPeople] = useState<Salesperson[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({
    business_unit: '',
    headshot_url: '',
    gender: '',
    is_active: true,
  })
  const [photoModalUrl, setPhotoModalUrl] = useState<string | null>(null)
  const [photoModalName, setPhotoModalName] = useState<string>('')

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Filter state - default: sales units + unassigned
  const [showUnassigned, setShowUnassigned] = useState(true)
  const [visibleUnits, setVisibleUnits] = useState<Set<string>>(new Set(SALES_UNITS))
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false)

  // Mobile sort dropdown
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false)

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
      gender: person.gender || '',
      is_active: person.is_active,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({ business_unit: '', headshot_url: '', gender: '', is_active: true })
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

  const sortFieldLabels: Record<SortField, string> = {
    name: 'Name',
    email: 'Email',
    business_unit: 'Business Unit',
    is_active: 'Active',
  }

  if (isMobile) {
    return (
      <div className={mobileStyles.container}>
        {/* Header */}
        <div className={mobileStyles.header}>
          <h2 className={mobileStyles.title}>People Management</h2>
          {unassignedCount > 0 && (
            <p className={mobileStyles.unassignedWarning}>
              ⚠️ {unassignedCount} {unassignedCount === 1 ? 'person' : 'people'} without business unit
            </p>
          )}
          <button
            onClick={syncSalespeople}
            disabled={syncing}
            className={mobileStyles.syncButton}
          >
            {syncing ? 'Syncing...' : '🔄 Sync from ServiceTitan'}
          </button>
        </div>

        {error && <div className={mobileStyles.error}>Error: {error}</div>}

        {/* Filter + Sort controls */}
        <div className={mobileStyles.controls}>
          <button
            className={mobileStyles.filterButton}
            onClick={() => setFilterDropdownOpen(true)}
          >
            Filter ({visibleUnits.size + (showUnassigned ? 1 : 0)}/{BUSINESS_UNITS.length + 1})
          </button>

          <div className={mobileStyles.sortDropdownWrap}>
            <button
              className={mobileStyles.sortButton}
              onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
            >
              Sort: {sortFieldLabels[sortField]} {sortDirection === 'asc' ? '↑' : '↓'}
            </button>
            {sortDropdownOpen && (
              <div className={mobileStyles.sortDropdown}>
                {(Object.keys(sortFieldLabels) as SortField[]).map((field) => (
                  <button
                    key={field}
                    className={`${mobileStyles.sortOption} ${sortField === field ? mobileStyles.sortOptionActive : ''}`}
                    onClick={() => {
                      handleSort(field)
                      setSortDropdownOpen(false)
                    }}
                  >
                    {sortFieldLabels[field]} {sortField === field ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Card list */}
        <div className={mobileStyles.cardList}>
          {filteredPeople.map((person) => {
            const isEditing = editingId === person.id
            return (
              <div key={person.id} className={mobileStyles.card}>
                <div className={mobileStyles.cardTop}>
                  {person.headshot_url ? (
                    <img
                      src={person.headshot_url}
                      alt={person.name}
                      className={mobileStyles.avatar}
                      onClick={() => {
                        setPhotoModalUrl(person.headshot_url)
                        setPhotoModalName(person.name)
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40"%3E%3Ccircle cx="20" cy="20" r="20" fill="%23334155"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-size="18"%3E' +
                          person.name.charAt(0).toUpperCase() +
                          '%3C/text%3E%3C/svg%3E'
                      }}
                    />
                  ) : (
                    <div className={mobileStyles.avatarPlaceholder}>
                      {person.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className={mobileStyles.cardInfo}>
                    <div className={mobileStyles.cardName}>{person.name}</div>
                    <div className={mobileStyles.cardTechId}>ID: {person.technician_id}</div>
                    <div className={mobileStyles.cardEmail}>
                      {person.email || <span className={mobileStyles.cardDash}>—</span>}
                    </div>
                  </div>
                  {!isEditing && (
                    <button
                      className={mobileStyles.editButton}
                      onClick={() => startEdit(person)}
                    >
                      Edit
                    </button>
                  )}
                </div>

                <div className={mobileStyles.cardMeta}>
                  {person.business_unit ? (
                    <span className={mobileStyles.businessUnit}>{person.business_unit}</span>
                  ) : (
                    <span className={mobileStyles.businessUnitUnset}>Not set</span>
                  )}
                  <span
                    className={`${mobileStyles.activeBadge} ${
                      person.is_active ? mobileStyles.badgeActive : mobileStyles.badgeInactive
                    }`}
                  >
                    {person.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Inline edit form */}
                {isEditing && (
                  <div className={mobileStyles.editForm}>
                    <div className={mobileStyles.editField}>
                      <label>Business Unit</label>
                      <select
                        value={editForm.business_unit}
                        onChange={(e) =>
                          setEditForm({ ...editForm, business_unit: e.target.value })
                        }
                      >
                        <option value="">Select...</option>
                        {BUSINESS_UNITS.map((unit) => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </div>
                    <div className={mobileStyles.editField}>
                      <label>Headshot URL</label>
                      <input
                        type="text"
                        value={editForm.headshot_url}
                        onChange={(e) =>
                          setEditForm({ ...editForm, headshot_url: e.target.value })
                        }
                        placeholder="https://..."
                      />
                    </div>
                    <div className={mobileStyles.editField}>
                      <label>Gender</label>
                      <select
                        value={editForm.gender}
                        onChange={(e) =>
                          setEditForm({ ...editForm, gender: e.target.value })
                        }
                      >
                        <option value="">Select...</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                        <option value="Prefer not to say">Prefer not to say</option>
                      </select>
                    </div>
                    <div className={mobileStyles.editToggleRow}>
                      <span className={mobileStyles.editToggleLabel}>Active</span>
                      <input
                        type="checkbox"
                        checked={editForm.is_active}
                        onChange={(e) =>
                          setEditForm({ ...editForm, is_active: e.target.checked })
                        }
                        className={mobileStyles.editToggle}
                      />
                    </div>
                    <div className={mobileStyles.editActions}>
                      <button
                        className={mobileStyles.saveButton}
                        onClick={() => saveEdit(person.id)}
                      >
                        Save
                      </button>
                      <button
                        className={mobileStyles.cancelButton}
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {filteredPeople.length === 0 && (
          <div className={mobileStyles.emptyState}>
            {salespeople.length === 0
              ? 'No people found. Tap "Sync from ServiceTitan" to import.'
              : 'No people match the current filters.'}
          </div>
        )}

        <div className={mobileStyles.countFooter}>
          Showing {filteredPeople.length} of {salespeople.length} people
        </div>

        {/* Bottom sheet filter */}
        {filterDropdownOpen && (
          <>
            <div
              className={mobileStyles.backdrop}
              onClick={() => setFilterDropdownOpen(false)}
            />
            <div className={mobileStyles.bottomSheet}>
              <div className={mobileStyles.sheetHandle} />
              <div className={mobileStyles.sheetHeader}>
                <h3 className={mobileStyles.sheetTitle}>Filter Business Units</h3>
                <button
                  className={mobileStyles.sheetClose}
                  onClick={() => setFilterDropdownOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className={mobileStyles.sheetBody}>
                <label className={mobileStyles.sheetRow}>
                  <input
                    type="checkbox"
                    checked={showUnassigned}
                    onChange={(e) => setShowUnassigned(e.target.checked)}
                    className={mobileStyles.sheetCheckbox}
                  />
                  <span className={showUnassigned ? mobileStyles.sheetLabelChecked : mobileStyles.sheetLabelUnchecked}>
                    Unassigned ({unassignedCount})
                  </span>
                </label>
                <hr className={mobileStyles.sheetDivider} />
                {BUSINESS_UNITS.map((unit) => (
                  <label key={unit} className={mobileStyles.sheetRow}>
                    <input
                      type="checkbox"
                      checked={visibleUnits.has(unit)}
                      onChange={() => toggleBusinessUnit(unit)}
                      className={mobileStyles.sheetCheckbox}
                    />
                    <span className={visibleUnits.has(unit) ? mobileStyles.sheetLabelChecked : mobileStyles.sheetLabelUnchecked}>
                      {unit}
                    </span>
                  </label>
                ))}
              </div>
              <button
                className={mobileStyles.sheetDone}
                onClick={() => setFilterDropdownOpen(false)}
              >
                Done
              </button>
            </div>
          </>
        )}

        {/* Photo Modal — shared with desktop */}
        {photoModalUrl && (
          <div
            onClick={() => setPhotoModalUrl(null)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              cursor: 'pointer',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'relative',
                maxWidth: '90vw',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div style={{
                marginBottom: '1rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#1e293b',
                borderRadius: '0.5rem',
                border: '1px solid #475569',
              }}>
                <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: '1.25rem' }}>
                  {photoModalName}
                </h3>
              </div>
              <img
                src={photoModalUrl}
                alt={photoModalName}
                style={{
                  maxWidth: '100%',
                  maxHeight: '80vh',
                  borderRadius: '0.5rem',
                  border: '3px solid #3b82f6',
                  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
                }}
              />
              <button
                onClick={() => setPhotoModalUrl(null)}
                style={{
                  position: 'absolute',
                  top: '-1rem',
                  right: '-1rem',
                  width: '3rem',
                  height: '3rem',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                }}
              >
                ×
              </button>
            </div>
          </div>
        )}
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
              <th style={{ ...tableHeaderStyle, width: '100px' }}>Photo</th>
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
              <th style={tableHeaderStyle}>Gender</th>
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
                  <td style={{ ...tableCellStyle, textAlign: 'center' }}>
                    {person.headshot_url ? (
                      <img
                        src={person.headshot_url}
                        alt={person.name}
                        onClick={() => {
                          setPhotoModalUrl(person.headshot_url)
                          setPhotoModalName(person.name)
                        }}
                        style={{
                          width: '60px',
                          height: '60px',
                          objectFit: 'cover',
                          borderRadius: '50%',
                          border: '2px solid #475569',
                          cursor: 'pointer',
                          transition: 'transform 0.2s, border-color 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.1)'
                          e.currentTarget.style.borderColor = '#3b82f6'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)'
                          e.currentTarget.style.borderColor = '#475569'
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="60" height="60"%3E%3Ccircle cx="30" cy="30" r="30" fill="%23334155"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-size="24"%3E' + person.name.charAt(0).toUpperCase() + '%3C/text%3E%3C/svg%3E'
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '60px',
                          height: '60px',
                          borderRadius: '50%',
                          backgroundColor: '#334155',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.5rem',
                          fontWeight: 'bold',
                          color: '#94a3b8',
                          margin: '0 auto',
                        }}
                      >
                        {person.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </td>
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
                      <div>
                        <div style={{ marginBottom: '0.5rem' }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                            Business Unit
                          </label>
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
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                            Headshot URL
                          </label>
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
                        </div>
                      </div>
                    ) : person.business_unit ? (
                      person.business_unit
                    ) : (
                      <span style={{ color: '#f59e0b', fontWeight: '600' }}>Not set</span>
                    )}
                  </td>
                  <td style={tableCellStyle}>
                    {isEditing ? (
                      <select
                        value={editForm.gender}
                        onChange={(e) =>
                          setEditForm({ ...editForm, gender: e.target.value })
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
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                        <option value="Prefer not to say">Prefer not to say</option>
                      </select>
                    ) : person.gender ? (
                      person.gender
                    ) : (
                      <span style={{ color: '#64748b' }}>—</span>
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

      {/* Photo Modal */}
      {photoModalUrl && (
        <div
          onClick={() => setPhotoModalUrl(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            cursor: 'pointer',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div style={{
              marginBottom: '1rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#1e293b',
              borderRadius: '0.5rem',
              border: '1px solid #475569',
            }}>
              <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: '1.25rem' }}>
                {photoModalName}
              </h3>
            </div>
            <img
              src={photoModalUrl}
              alt={photoModalName}
              style={{
                maxWidth: '100%',
                maxHeight: '80vh',
                borderRadius: '0.5rem',
                border: '3px solid #3b82f6',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
              }}
            />
            <button
              onClick={() => setPhotoModalUrl(null)}
              style={{
                position: 'absolute',
                top: '-1rem',
                right: '-1rem',
                width: '3rem',
                height: '3rem',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                cursor: 'pointer',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              }}
            >
              ×
            </button>
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
