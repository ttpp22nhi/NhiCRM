/**
 * Điều kiện WHERE so khớp cột username (bảng employees) không phân biệt hoa/thường, có trim.
 * Tham số: $1 = chuỗi nhập (đã trim ở tầng controller nếu cần).
 */
export const SQL_EMPLOYEE_USERNAME_EQUALS = `LOWER(TRIM(COALESCE(username, ''))) = LOWER(TRIM(COALESCE($1::text, '')))`
