SET NAMES utf8mb4;

INSERT INTO `role` (`id`, `name`, `intro`, `createAt`, `updateAt`) VALUES
  (1, '超级管理员', '迁移 smoke 管理员角色', '2026-01-01 08:00:00', '2026-01-01 08:00:00'),
  (2, '普通操作员', '迁移 smoke 普通角色', '2026-01-01 08:01:00', '2026-01-01 08:01:00');

INSERT INTO `permission` (`id`, `pid`, `name`, `type`, `url`, `icon`, `sort`, `createAt`, `updateAt`) VALUES
  (1, 0, '系统总览', 1, '/main/analysis', 'LayoutDashboard', 1, '2026-01-01 08:00:00', '2026-01-01 08:00:00'),
  (11, 1, '核心技术栈', 2, '/main/analysis/overview', 'Info', 1, '2026-01-01 08:00:01', '2026-01-01 08:00:01'),
  (12, 1, '工作台', 2, '/main/analysis/workbench', 'BarChart3', 2, '2026-01-01 08:00:02', '2026-01-01 08:00:02'),
  (2, 0, '订单管理', 1, '/main/order', 'Truck', 2, '2026-01-01 08:00:03', '2026-01-01 08:00:03'),
  (21, 2, '运单列表', 2, '/main/order/list', 'FileText', 1, '2026-01-01 08:00:04', '2026-01-01 08:00:04'),
  (3, 0, '回单管理', 1, '/main/receipt', 'ReceiptText', 3, '2026-01-01 08:00:05', '2026-01-01 08:00:05'),
  (31, 3, '全部回单', 2, '/main/receipt/list', 'ClipboardList', 1, '2026-01-01 08:00:06', '2026-01-01 08:00:06');

INSERT INTO `user` (`id`, `name`, `password`, `avatar_url`, `token`, `enable`, `createAt`, `updateAt`) VALUES
  (1, 'admin', '0192023a7bbd73250516f069df18b500', '/users/1/avatar', 'legacy-admin-token', 1, '2026-01-01 08:02:00', '2026-01-01 08:02:00'),
  (2, 'operator', '0192023a7bbd73250516f069df18b500', '/users/2/avatar', 'legacy-operator-token', 1, '2026-01-01 08:03:00', '2026-01-01 08:03:00');

INSERT INTO `company` (`id`, `name`, `createAt`, `updateAt`) VALUES
  (1, '迁移发货公司', '2026-01-01 08:04:00', '2026-01-01 08:04:00'),
  (2, '迁移备用公司', '2026-01-01 08:05:00', '2026-01-01 08:05:00');

INSERT INTO `memory` (`id`, `name`, `createAt`, `updateAt`) VALUES
  (1, '迁移收货人', '2026-01-01 08:06:00', '2026-01-01 08:06:00'),
  (2, '迁移发货人', '2026-01-01 08:07:00', '2026-01-01 08:07:00');

INSERT INTO `avatar` (`id`, `filename`, `mimetype`, `size`, `user_id`, `createAt`, `updateAt`) VALUES
  (1, 'default.jpg', 'image/jpeg', 17, 1, '2026-01-01 08:08:00', '2026-01-01 08:08:00'),
  (2, 'admin-smoke.jpg', 'image/jpeg', 21, 2, '2026-01-01 08:09:00', '2026-01-01 08:09:00');

INSERT INTO `user_role` (`id`, `user_id`, `role_id`, `createAt`, `updateAt`) VALUES
  (1, 1, 1, '2026-01-01 08:10:00', '2026-01-01 08:10:00'),
  (2, 2, 2, '2026-01-01 08:11:00', '2026-01-01 08:11:00');

INSERT INTO `role_permission` (`id`, `role_id`, `permission_id`, `createAt`, `updateAt`) VALUES
  (1, 1, 1, '2026-01-01 08:12:00', '2026-01-01 08:12:00'),
  (2, 1, 11, '2026-01-01 08:12:01', '2026-01-01 08:12:01'),
  (3, 1, 12, '2026-01-01 08:12:02', '2026-01-01 08:12:02'),
  (4, 1, 2, '2026-01-01 08:12:03', '2026-01-01 08:12:03'),
  (5, 1, 21, '2026-01-01 08:12:04', '2026-01-01 08:12:04'),
  (6, 1, 3, '2026-01-01 08:12:05', '2026-01-01 08:12:05'),
  (7, 1, 31, '2026-01-01 08:12:06', '2026-01-01 08:12:06'),
  (8, 2, 1, '2026-01-01 08:13:00', '2026-01-01 08:13:00'),
  (9, 2, 12, '2026-01-01 08:13:01', '2026-01-01 08:13:01');

INSERT INTO `order_list` (
  `id`, `oddnumber`, `billingAt`, `consignee`, `consigneephone`, `address`, `method`,
  `goodsname`, `number`, `pack`, `weight`, `measurement`, `cainsurance`, `value`,
  `insurance`, `consignor`, `consignorphone`, `freight`, `delivery`, `sumfreight`,
  `freightstate`, `paynow`, `paygo`, `payback`, `paymonth`, `receiptnum`, `company`,
  `remarks`, `createAt`, `updateAt`
) VALUES
  (
    1, 'MIG-SMOKE-0001', 1783008000000, '迁移收货人', '13800000001', '迁移地址一', '自提',
    '迁移货物A', '2', '纸箱', '12kg', '0.4m3', '否', '1000',
    '0', '迁移发货人', '13900000001', '80', '20', '100',
    '已付', '100', '0', '0', '0', 1, '迁移发货公司',
    '迁移 smoke 带回单订单', '2026-01-01 09:00:00', '2026-01-01 09:00:00'
  ),
  (
    2, 'MIG-SMOKE-0002', 1783094400000, '迁移收货人二', '13800000002', '迁移地址二', '送货',
    '迁移货物B', '1', '托盘', '20kg', '0.8m3', '是', '2000',
    '10', '迁移发货人二', '13900000002', '120', '30', '150',
    '到付', '0', '150', '0', '0', 0, '迁移备用公司',
    '迁移 smoke 无回单订单', '2026-01-02 09:00:00', '2026-01-02 09:00:00'
  );

INSERT INTO `company_order` (`id`, `com_name`, `order_id`, `createAt`, `updateAt`) VALUES
  (1, '迁移发货公司', 1, '2026-01-01 09:01:00', '2026-01-01 09:01:00'),
  (2, '迁移备用公司', 2, '2026-01-02 09:01:00', '2026-01-02 09:01:00');

INSERT INTO `receipt` (
  `id`, `oddnumber`, `billingAt`, `recoverystate`, `issuestate`, `poststate`,
  `recoverynumber`, `consignor`, `consignee`, `goodsname`, `goodsnumber`,
  `createAt`, `updateAt`
) VALUES
  (
    1, 'MIG-SMOKE-0001', 1783008000000, '未回收', '已接收', '未寄出',
    1, '迁移发货人', '迁移收货人', '迁移货物A', '2',
    '2026-01-01 09:02:00', '2026-01-01 09:02:00'
  );
