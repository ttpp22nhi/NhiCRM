/**
 * Dịch vụ path đệ quy "Búp bê Nga" cho departments
 * - Path format: tenantId/id hoặc tenantId/parentId/childId (dùng / chuẩn, ID không chứa /)
 * - Root: path = tenantId / ID_Hien_Tai
 * - Cập nhật đệ quy trong transaction để đồng bộ khi cha đổi
 */
import pool from '../database.js'

const PATH_SEP = '/'

/**
 * Tính path cho một node (không ghi DB)
 * Root: tenantId + / + id. Có cha: parentPath + / + id.
 * @param {string} id - ID department
 * @param {string|null} parent_id
 * @param {string} tenantId
 * @returns {Promise<string>}
 */
export async function computePathForDepartment(id, parent_id, tenantId) {
  if (!tenantId) throw new Error('tenantId bắt buộc')
  if (!parent_id) {
    return `${tenantId}${PATH_SEP}${id}`
  }
  const r = await pool.query(
    'SELECT path FROM departments WHERE id = $1 AND tenant_id = $2',
    [parent_id, tenantId]
  )
  if (r.rows.length === 0) return `${tenantId}${PATH_SEP}${id}`
  const parentPath = r.rows[0].path || `${tenantId}${PATH_SEP}${parent_id}`
  return `${parentPath}${PATH_SEP}${id}`
}

/**
 * Tự động tính và đồng bộ path cho một phòng ban và toàn bộ con/cháu (cùng tenant).
 * Dùng khi tạo mới hoặc đổi parent_id. Chạy trong transaction.
 * @param {string} departmentId
 * @param {string} tenantId
 * @returns {Promise<string>} newPath
 */
export async function calculateAndSyncPath(departmentId, tenantId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const dept = await client.query(
      'SELECT id, parent_id, path FROM departments WHERE id = $1 AND tenant_id = $2',
      [departmentId, tenantId]
    )
    if (dept.rows.length === 0) {
      await client.query('ROLLBACK')
      throw new Error('Không tìm thấy phòng ban')
    }

    const { parent_id } = dept.rows[0]
    let newPath
    if (!parent_id) {
      newPath = `${tenantId}${PATH_SEP}${departmentId}`
    } else {
      const parentRow = await client.query(
        'SELECT path FROM departments WHERE id = $1 AND tenant_id = $2',
        [parent_id, tenantId]
      )
      const parentPath = parentRow.rows[0]?.path || `${tenantId}${PATH_SEP}${parent_id}`
      newPath = `${parentPath}${PATH_SEP}${departmentId}`
    }

    const now = Date.now()
    await client.query(
      'UPDATE departments SET path = $1, updated_at = $2 WHERE id = $3 AND tenant_id = $4',
      [newPath, now, departmentId, tenantId]
    )

    await syncChildrenPathInTransaction(client, departmentId, newPath, tenantId)

    await client.query('COMMIT')
    return newPath
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/**
 * Đệ quy cập nhật path cho tất cả con trong cùng tenant (đã trong transaction)
 */
async function syncChildrenPathInTransaction(client, parentId, parentPath, tenantId) {
  const children = await client.query(
    'SELECT id FROM departments WHERE parent_id = $1 AND tenant_id = $2',
    [parentId, tenantId]
  )
  const now = Date.now()
  for (const row of children.rows) {
    const childPath = `${parentPath}${PATH_SEP}${row.id}`
    await client.query(
      'UPDATE departments SET path = $1, updated_at = $2 WHERE id = $3 AND tenant_id = $4',
      [childPath, now, row.id, tenantId]
    )
    await syncChildrenPathInTransaction(client, row.id, childPath, tenantId)
  }
}

/**
 * Cập nhật path đệ quy (giữ tương thích với code cũ; nội bộ gọi logic tenantId/id cho root)
 * @param {string} departmentId
 * @param {string} newPath - đã tính sẵn (dạng tenantId/id hoặc tenantId/.../id)
 * @param {string} [tenantId] - bắt buộc để tránh cập nhật nhầm tenant
 */
export async function updatePathsRecursive(departmentId, newPath, tenantId) {
  if (!tenantId) throw new Error('tenantId is required for recursive path updates')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const now = Date.now()
    const updateParams = tenantId
      ? [newPath, now, departmentId, tenantId]
      : [newPath, now, departmentId]
    await client.query(
      'UPDATE departments SET path = $1, updated_at = $2 WHERE id = $3' + (tenantId ? ' AND tenant_id = $4' : ''),
      updateParams
    )
    await syncChildrenPathInTransaction(client, departmentId, newPath, tenantId)
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}
