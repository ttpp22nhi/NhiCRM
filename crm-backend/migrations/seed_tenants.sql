-- ============================================
-- Seed dữ liệu mẫu cho bảng tenants (kiểm thử phân tách dữ liệu)
-- ============================================

INSERT INTO public.tenants (id, name, domain, package_type, max_users, max_levels, is_active, created_at, updated_at)
VALUES
  (
    'tenant-mobifone-tayninh',
    'MobiFoneTayNinh',
    'mobifone-tayninh',
    'Growth',
    50,
    6,
    true,
    extract(epoch from now())::bigint * 1000,
    extract(epoch from now())::bigint * 1000
  ),
  (
    'tenant-cong-ty-khach-hang-a',
    'Công ty Khách hàng A',
    'cong-ty-khach-hang-a',
    'Starter',
    10,
    5,
    true,
    extract(epoch from now())::bigint * 1000,
    extract(epoch from now())::bigint * 1000
  )
ON CONFLICT (domain) DO NOTHING;
