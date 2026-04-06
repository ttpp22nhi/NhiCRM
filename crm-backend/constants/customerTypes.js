/**
 * Danh sách loại khách — giữ khớp CustomerForm.tsx / EditCustomerForm.tsx (frontend).
 */
export const CUSTOMER_TYPE_OPTIONS = [
  { value: 'individual', label: 'Cá nhân' },
  { value: 'so_ban_nganh', label: 'Sở ban ngành' },
  { value: 'cong_an_tinh', label: 'Công an Tỉnh' },
  { value: 'cong_an_xa', label: 'Công an xã' },
  { value: 'xa_phuong', label: 'Xã phường' },
  { value: 'doanh_nghiep_lon', label: 'Doanh nghiệp lớn' },
  { value: 'ho_kinh_doanh', label: 'Hộ kinh doanh' },
  { value: 'hop_tac_xa', label: 'Hợp tác xã' },
  { value: 'company', label: 'Doanh nghiệp' },
]

export const CUSTOMER_TYPE_VALUES = CUSTOMER_TYPE_OPTIONS.map((o) => o.value)
