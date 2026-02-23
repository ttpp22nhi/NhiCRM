import { v4 as uuidv4 } from 'uuid';
import pool from '../database.js';
import { getTenantId } from '../utils/tenantHelper.js';

/**
 * Tạo yêu cầu chuyển giao khách hàng (Sales)
 * POST /api/transfer/request
 */
export const createTransferRequest = async (req, res) => {
  const { customer_ids, receiver_id, note } = req.body;
  const { id: userId, role } = req.user;
  const tenantId = getTenantId(req);

  try {
    if (!customer_ids || !Array.isArray(customer_ids) || customer_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn ít nhất một khách hàng để chuyển giao.'
      });
    }
    if (!receiver_id || receiver_id.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn nhân viên tiếp nhận.'
      });
    }

    const receiverResult = await pool.query(
      `SELECT employee_id, full_name, role, is_active 
       FROM public.employees 
       WHERE employee_id = $1 AND tenant_id = $2`,
      [receiver_id, tenantId]
    );

    if (receiverResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhân viên tiếp nhận.'
      });
    }

    const receiver = receiverResult.rows[0];
    if (!receiver.is_active) {
      return res.status(400).json({
        success: false,
        message: 'Nhân viên tiếp nhận đã bị vô hiệu hóa.'
      });
    }

    if (receiver_id === userId) {
      return res.status(400).json({
        success: false,
        message: 'Bạn không thể chuyển giao khách hàng cho chính mình.'
      });
    }

    if (role === 'sales') {
      const customerPlaceholders = customer_ids.map((_, index) => `$${index + 1}`).join(', ');
      const customerCheckResult = await pool.query(
        `SELECT customer_id, full_name, assigned_to 
         FROM public.customers 
         WHERE customer_id IN (${customerPlaceholders}) 
         AND tenant_id = $${customer_ids.length + 1} AND deleted_at IS NULL`,
        [...customer_ids, tenantId]
      );

      if (customerCheckResult.rows.length !== customer_ids.length) {
        return res.status(400).json({
          success: false,
          message: 'Một số khách hàng không tồn tại hoặc đã bị xóa.'
        });
      }

      // Kiểm tra tất cả khách hàng phải thuộc về người gửi
      const invalidCustomers = customerCheckResult.rows.filter(
        customer => customer.assigned_to !== userId
      );

      if (invalidCustomers.length > 0) {
        return res.status(403).json({
          success: false,
          message: `Bạn không có quyền chuyển giao một số khách hàng. Khách hàng: ${invalidCustomers.map(c => c.full_name).join(', ')} không thuộc về bạn.`
        });
      }
    }

    const existingRequestResult = await pool.query(
      `SELECT transfer_request_id, customer_ids, status 
       FROM public.transfer_requests 
       WHERE status = 'pending' AND tenant_id = $1
       AND sender_id = $2 
       AND customer_ids && $3::text[]`,
      [tenantId, userId, customer_ids]
    );

    if (existingRequestResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Đã có yêu cầu chuyển giao đang chờ phê duyệt cho một số khách hàng này.'
      });
    }

    // 5. Tạo yêu cầu chuyển giao
    const transferRequestId = uuidv4();
    const now = Date.now();

    await pool.query(
      `INSERT INTO public.transfer_requests (
        transfer_request_id, customer_ids, sender_id, receiver_id, 
        status, note, tenant_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        transferRequestId,
        customer_ids,
        userId,
        receiver_id,
        'pending',
        note || null,
        tenantId,
        now,
        now
      ]
    );

    const managersResult = await pool.query(
      `SELECT employee_id FROM public.employees 
       WHERE role IN ('admin', 'manager') AND is_active = true AND tenant_id = $1`,
      [tenantId]
    );

    const senderResult = await pool.query(
      `SELECT full_name FROM public.employees WHERE employee_id = $1`,
      [userId]
    );
    const senderName = senderResult.rows[0]?.full_name || 'Nhân viên';

    for (const manager of managersResult.rows) {
      const notificationId = uuidv4();
      await pool.query(
        `INSERT INTO public.notifications (
          notification_id, employee_id, type, title, message, is_read, tenant_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          notificationId,
          manager.employee_id,
          'transfer_request',
          'Yêu cầu chuyển giao khách hàng',
          `${senderName} muốn chuyển giao ${customer_ids.length} khách hàng cho ${receiver.full_name}. Vui lòng xem xét phê duyệt.`,
          false,
          tenantId,
          now
        ]
      );
    }

    res.json({
      success: true,
      message: 'Đã gửi yêu cầu chuyển giao thành công. Vui lòng chờ phê duyệt từ quản lý.',
      data: {
        transfer_request_id: transferRequestId,
        customer_ids,
        receiver: {
          employee_id: receiver_id,
          full_name: receiver.full_name
        }
      }
    });
  } catch (error) {
    console.error('Lỗi createTransferRequest:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi tạo yêu cầu chuyển giao.',
      error: error.message
    });
  }
};

/**
 * Lấy danh sách yêu cầu chuyển giao đang chờ (Manager)
 * GET /api/transfer/pending
 */
export const getPendingTransferRequests = async (req, res) => {
  const { role } = req.user;
  const tenantId = getTenantId(req);

  try {
    if (role !== 'manager' && role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xem danh sách yêu cầu chuyển giao.'
      });
    }

    const result = await pool.query(
      `SELECT 
        tr.transfer_request_id,
        tr.customer_ids,
        tr.sender_id,
        tr.receiver_id,
        tr.status,
        tr.note,
        tr.approval_note,
        tr.created_at,
        tr.updated_at,
        tr.approved_by,
        tr.approved_at,
        sender.full_name as sender_name,
        sender.username as sender_username,
        receiver.full_name as receiver_name,
        receiver.username as receiver_username,
        approver.full_name as approver_name
      FROM public.transfer_requests tr
      LEFT JOIN public.employees sender ON tr.sender_id = sender.employee_id
      LEFT JOIN public.employees receiver ON tr.receiver_id = receiver.employee_id
      LEFT JOIN public.employees approver ON tr.approved_by = approver.employee_id
      WHERE tr.status = 'pending' AND tr.tenant_id = $1
      ORDER BY tr.created_at DESC`,
      [tenantId]
    );

    const requestsWithCustomers = await Promise.all(
      result.rows.map(async (request) => {
        const customerPlaceholders = request.customer_ids.map((_, index) => `$${index + 1}`).join(', ');
        const customersResult = await pool.query(
          `SELECT customer_id, full_name, phone, company_name 
           FROM public.customers 
           WHERE customer_id IN (${customerPlaceholders}) 
           AND tenant_id = $${request.customer_ids.length + 1} AND deleted_at IS NULL`,
          [...request.customer_ids, tenantId]
        );

        return {
          ...request,
          customers: customersResult.rows
        };
      })
    );

    res.json({
      success: true,
      data: requestsWithCustomers,
      count: requestsWithCustomers.length
    });
  } catch (error) {
    console.error('Lỗi getPendingTransferRequests:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy danh sách yêu cầu chuyển giao.',
      error: error.message
    });
  }
};

/**
 * Phê duyệt hoặc từ chối yêu cầu chuyển giao (Manager)
 * PATCH /api/transfer/approve/:id
 */
export const approveTransferRequest = async (req, res) => {
  const { id } = req.params;
  const { action, approval_note } = req.body; // 'approve' hoặc 'reject', approval_note là bắt buộc
  const { id: userId, role } = req.user;

  try {
    // 1. Kiểm tra quyền
    if (role !== 'manager' && role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền phê duyệt yêu cầu chuyển giao.'
      });
    }

    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({
        success: false,
        message: 'Action phải là "approve" hoặc "reject".'
      });
    }

    // 1.1. Kiểm tra approval_note là bắt buộc
    if (!approval_note || approval_note.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập nội dung phê duyệt/từ chối.'
      });
    }

    const tenantId = getTenantId(req);

    const requestResult = await pool.query(
      `SELECT 
        tr.*,
        sender.full_name as sender_name,
        receiver.full_name as receiver_name
      FROM public.transfer_requests tr
      LEFT JOIN public.employees sender ON tr.sender_id = sender.employee_id
      LEFT JOIN public.employees receiver ON tr.receiver_id = receiver.employee_id
      WHERE tr.transfer_request_id = $1 AND tr.tenant_id = $2`,
      [id, tenantId]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy yêu cầu chuyển giao.'
      });
    }

    const request = requestResult.rows[0];

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Yêu cầu này đã được xử lý (trạng thái: ${request.status}).`
      });
    }

    if (action === 'reject') {
      const now = Date.now();
      await pool.query(
        `UPDATE public.transfer_requests 
         SET status = 'rejected', 
             approved_by = $1, 
             approved_at = $2, 
             updated_at = $2,
             approval_note = $4
         WHERE transfer_request_id = $3 AND tenant_id = $5`,
        [userId, now, id, approval_note.trim(), tenantId]
      );

      // Ghi log phê duyệt
      const logId = uuidv4();
      await pool.query(
        `INSERT INTO public.transfer_approval_logs (
          log_id, transfer_request_id, approver_id, action, approval_note,
          sender_id, receiver_id, customer_count, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          logId,
          id,
          userId,
          'reject',
          approval_note.trim(),
          request.sender_id,
          request.receiver_id,
          request.customer_ids.length,
          now
        ]
      );

      const notificationId = uuidv4();
      await pool.query(
        `INSERT INTO public.notifications (
          notification_id, employee_id, type, title, message, is_read, tenant_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          notificationId,
          request.sender_id,
          'transfer_request_rejected',
          'Yêu cầu chuyển giao bị từ chối',
          `Yêu cầu chuyển giao ${request.customer_ids.length} khách hàng cho ${request.receiver_name} đã bị từ chối. Lý do: ${approval_note.trim()}`,
          false,
          tenantId,
          now
        ]
      );

      return res.json({
        success: true,
        message: 'Đã từ chối yêu cầu chuyển giao.'
      });
    }

    // 4. Nếu phê duyệt, thực hiện chuyển giao (tương tự bulkTransferCustomers)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const now = Date.now();

      const { customer_ids, sender_id, receiver_id } = request;

      const receiverCheck = await client.query(
        `SELECT employee_id, full_name, is_active 
         FROM public.employees 
         WHERE employee_id = $1 AND tenant_id = $2`,
        [receiver_id, tenantId]
      );

      if (receiverCheck.rows.length === 0 || !receiverCheck.rows[0].is_active) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Nhân viên tiếp nhận không còn hoạt động.'
        });
      }

      const newEmployee = receiverCheck.rows[0];

      const customerPlaceholders1 = customer_ids.map((_, index) => `$${index + 1}`).join(', ');
      const customersResult = await client.query(
        `SELECT customer_id, full_name, assigned_to 
         FROM public.customers 
         WHERE customer_id IN (${customerPlaceholders1}) 
         AND tenant_id = $${customer_ids.length + 1} AND deleted_at IS NULL`,
        [...customer_ids, tenantId]
      );

      if (customersResult.rows.length !== customer_ids.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Một số khách hàng không còn tồn tại hoặc đã bị xóa.'
        });
      }

      const validCustomers = customersResult.rows;

      // 4.3. Lấy tên người gửi cũ
      const senderCheck = await client.query(
        `SELECT full_name FROM public.employees WHERE employee_id = $1`,
        [sender_id]
      );
      const oldEmployeeName = senderCheck.rows[0]?.full_name || 'Nhân viên cũ';

      const customerPlaceholders2 = customer_ids.map((_, index) => `$${index + 1}`).join(', ');
      const dealsCountResult = await client.query(
        `SELECT COUNT(DISTINCT d.deal_id) as count
         FROM public.deals d
         INNER JOIN public.customers c ON d.customer_id = c.customer_id
         WHERE c.customer_id IN (${customerPlaceholders2})
         AND c.tenant_id = $${customer_ids.length + 1} AND c.deleted_at IS NULL
         AND d.stage NOT IN ('closed_won', 'closed_lost', 'Thành công', 'Thất bại')`,
        [...customer_ids, tenantId]
      );
      const dealsCount = parseInt(dealsCountResult.rows[0].count) || 0;

      const customerPlaceholders3 = customer_ids.map((_, index) => `$${index + 3}`).join(', ');
      const tasksUpdateResult = await client.query(
        `UPDATE public.tasks 
         SET assigned_to = $1 
         WHERE customer_id IN (${customerPlaceholders3}) 
         AND tenant_id = $2 AND is_completed = false 
         RETURNING task_id`,
        [receiver_id, tenantId, ...customer_ids]
      );
      const tasksCount = tasksUpdateResult.rowCount || 0;

      const customerPlaceholders4 = customer_ids.map((_, index) => `$${index + 4}`).join(', ');
      await client.query(
        `UPDATE public.customers
         SET assigned_to = $1, updated_at = $2
         WHERE customer_id IN (${customerPlaceholders4}) AND tenant_id = $3 AND deleted_at IS NULL`,
        [receiver_id, now, tenantId, ...customer_ids]
      );

      for (const customer of validCustomers) {
        const interactionId = uuidv4();
        const content = `BÀN GIAO HỆ THỐNG: Khách hàng và các công việc đang dang dở được chuyển từ ${oldEmployeeName} sang ${newEmployee.full_name} (Yêu cầu đã được phê duyệt).${request.note ? ` Lý do: ${request.note}` : ''}`;

        await client.query(
          `INSERT INTO public.interactions (
            interaction_id, customer_id, interaction_type, content,
            interaction_date, employee_id, status, tenant_id, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [interactionId, customer.customer_id, 'system', content.trim(), now, userId, 'system', tenantId, now]
        );
      }

      await client.query(
        `UPDATE public.transfer_requests 
         SET status = 'approved', 
             approved_by = $1, 
             approved_at = $2, 
             updated_at = $2,
             approval_note = $4
         WHERE transfer_request_id = $3 AND tenant_id = $5`,
        [userId, now, id, approval_note.trim(), tenantId]
      );

      // 4.8.1. Ghi log phê duyệt
      const logId = uuidv4();
      await client.query(
        `INSERT INTO public.transfer_approval_logs (
          log_id, transfer_request_id, approver_id, action, approval_note,
          sender_id, receiver_id, customer_count, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          logId,
          id,
          userId,
          'approve',
          approval_note.trim(),
          sender_id,
          receiver_id,
          validCustomers.length,
          now
        ]
      );

      const notificationIdSender = uuidv4();
      await client.query(
        `INSERT INTO public.notifications (
          notification_id, employee_id, type, title, message, is_read, tenant_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          notificationIdSender,
          sender_id,
          'transfer_request_approved',
          'Yêu cầu chuyển giao đã được phê duyệt',
          `Yêu cầu chuyển giao ${validCustomers.length} khách hàng cho ${newEmployee.full_name} đã được phê duyệt. Nội dung: ${approval_note.trim()}`,
          false,
          tenantId,
          now
        ]
      );

      const notificationIdReceiver = uuidv4();
      const taskDescription = `${tasksCount} task chưa hoàn thành`;
      await client.query(
        `INSERT INTO public.notifications (
          notification_id, employee_id, type, title, message, is_read, tenant_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          notificationIdReceiver,
          receiver_id,
          'customer_bulk_transfer',
          'Nhận bàn giao khách hàng',
          `Bạn vừa nhận bàn giao ${validCustomers.length} khách hàng từ ${oldEmployeeName} với ${dealsCount} deal đang mở và ${taskDescription}. Vui lòng kiểm tra danh sách.`,
          false,
          tenantId,
          now
        ]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `Đã phê duyệt và chuyển giao thành công ${validCustomers.length} khách hàng cho ${newEmployee.full_name}.`,
        data: {
          customers_transferred: validCustomers.length,
          deals_count: dealsCount,
          tasks_transferred: tasksCount,
          new_employee: {
            employee_id: receiver_id,
            full_name: newEmployee.full_name
          }
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Lỗi approveTransferRequest:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi phê duyệt yêu cầu chuyển giao.',
      error: error.message
    });
  }
};

/**
 * Lấy danh sách yêu cầu chuyển giao của người dùng hiện tại (Sales)
 * GET /api/transfer/my-requests
 */
export const getMyTransferRequests = async (req, res) => {
  const { id: userId } = req.user;
  const tenantId = getTenantId(req);

  try {
    const result = await pool.query(
      `SELECT 
        tr.transfer_request_id,
        tr.customer_ids,
        tr.sender_id,
        tr.receiver_id,
        tr.status,
        tr.note,
        tr.created_at,
        tr.updated_at,
        tr.approved_by,
        tr.approved_at,
        receiver.full_name as receiver_name,
        receiver.username as receiver_username,
        approver.full_name as approver_name
      FROM public.transfer_requests tr
      LEFT JOIN public.employees receiver ON tr.receiver_id = receiver.employee_id
      LEFT JOIN public.employees approver ON tr.approved_by = approver.employee_id
      WHERE tr.sender_id = $1 AND tr.tenant_id = $2
      ORDER BY tr.created_at DESC`,
      [userId, tenantId]
    );

    const requestsWithCustomers = await Promise.all(
      result.rows.map(async (request) => {
        const customerPlaceholders = request.customer_ids.map((_, index) => `$${index + 1}`).join(', ');
        const customersResult = await pool.query(
          `SELECT customer_id, full_name, phone, company_name 
           FROM public.customers 
           WHERE customer_id IN (${customerPlaceholders}) 
           AND tenant_id = $${request.customer_ids.length + 1} AND deleted_at IS NULL`,
          [...request.customer_ids, tenantId]
        );

        return {
          ...request,
          customers: customersResult.rows
        };
      })
    );

    res.json({
      success: true,
      data: requestsWithCustomers,
      count: requestsWithCustomers.length
    });
  } catch (error) {
    console.error('Lỗi getMyTransferRequests:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy danh sách yêu cầu chuyển giao.',
      error: error.message
    });
  }
};

/**
 * Lấy lịch sử phê duyệt chuyển giao
 * GET /api/transfer/approval-logs
 */
export const getApprovalLogs = async (req, res) => {
  const { role } = req.user;
  const tenantId = getTenantId(req);
  let { page = 1, limit = 20, transfer_request_id, approver_id } = req.query;

  try {
    if (role !== 'manager' && role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xem lịch sử phê duyệt chuyển giao.'
      });
    }

    page = Math.max(1, parseInt(page) || 1);
    limit = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const offset = (page - 1) * limit;
    let whereConditions = ['tr.tenant_id = $1'];
    let queryParams = [tenantId];
    let paramIndex = 2;

    if (transfer_request_id) {
      whereConditions.push(`tal.transfer_request_id = $${paramIndex++}`);
      queryParams.push(transfer_request_id);
    }
    if (approver_id) {
      whereConditions.push(`tal.approver_id = $${paramIndex++}`);
      queryParams.push(approver_id);
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM public.transfer_approval_logs tal
      LEFT JOIN public.transfer_requests tr ON tal.transfer_request_id = tr.transfer_request_id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total) || 0;

    // Query danh sách logs
    const query = `
      SELECT 
        tal.log_id,
        tal.transfer_request_id,
        tal.approver_id,
        tal.action,
        tal.approval_note,
        tal.sender_id,
        tal.receiver_id,
        tal.customer_count,
        tal.created_at,
        tr.created_at as request_created_at,
        approver.full_name as approver_name,
        approver.username as approver_username,
        sender.full_name as sender_name,
        sender.username as sender_username,
        receiver.full_name as receiver_name,
        receiver.username as receiver_username
      FROM public.transfer_approval_logs tal
      LEFT JOIN public.transfer_requests tr ON tal.transfer_request_id = tr.transfer_request_id
      LEFT JOIN public.employees approver ON tal.approver_id = approver.employee_id
      LEFT JOIN public.employees sender ON tal.sender_id = sender.employee_id
      LEFT JOIN public.employees receiver ON tal.receiver_id = receiver.employee_id
      ${whereClause}
      ORDER BY tal.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Lỗi getApprovalLogs:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi lấy lịch sử phê duyệt chuyển giao.',
      error: error.message
    });
  }
};

/**
 * Kiểm tra xem khách hàng có đang chờ chuyển giao không
 * GET /api/transfer/check-pending/:customerId
 */
export const checkCustomerPendingTransfer = async (req, res) => {
  const { customerId } = req.params;
  const { id: userId } = req.user;
  const tenantId = getTenantId(req);

  try {
    const result = await pool.query(
      `SELECT transfer_request_id, status, receiver_id, created_at
       FROM public.transfer_requests
       WHERE $1 = ANY(customer_ids)
       AND sender_id = $2 AND tenant_id = $3
       AND status = 'pending'
       ORDER BY created_at DESC
       LIMIT 1`,
      [customerId, userId, tenantId]
    );

    if (result.rows.length > 0) {
      const request = result.rows[0];
      const receiverResult = await pool.query(
        `SELECT full_name FROM public.employees WHERE employee_id = $1`,
        [request.receiver_id]
      );

      res.json({
        success: true,
        has_pending: true,
        data: {
          transfer_request_id: request.transfer_request_id,
          receiver_name: receiverResult.rows[0]?.full_name || 'Nhân viên',
          created_at: request.created_at
        }
      });
    } else {
      res.json({
        success: true,
        has_pending: false
      });
    }
  } catch (error) {
    console.error('Lỗi checkCustomerPendingTransfer:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi kiểm tra trạng thái chuyển giao.',
      error: error.message
    });
  }
};
