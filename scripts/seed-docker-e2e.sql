SET NAMES utf8mb4;

DELETE FROM `role_permission`;
DELETE FROM `user_role`;
DELETE FROM `avatar`;
DELETE FROM `receipt`;
DELETE FROM `company_order`;
DELETE FROM `order_list`;
DELETE FROM `memory`;
DELETE FROM `company`;
DELETE FROM `permission`;
DELETE FROM `role`;
DELETE FROM `user`;

INSERT INTO `role` (`id`, `name`, `intro`) VALUES
  (1, '超级管理员', 'Docker E2E 管理员角色');

INSERT INTO `permission` (`id`, `pid`, `name`, `type`, `url`, `icon`, `sort`) VALUES
  (1, 0, '工作台', 1, '/main/workbench', 'dashboard', 1),
  (2, 0, '订单列表', 1, '/main/order/orders', 'orders', 2),
  (3, 0, '回单管理', 1, '/main/receipt', 'receipt', 3),
  (4, 0, '发货公司', 1, '/main/order/company', 'company', 4),
  (5, 0, '用户管理', 1, '/main/system/user', 'users', 5),
  (6, 0, '角色权限', 1, '/main/system/role', 'roles', 6),
  (7, 0, '菜单管理', 1, '/main/system/menu', 'menus', 7),
  (8, 0, '页面注册表', 1, '/main/system/registry', 'registry', 8),
  (9, 0, '系统设置', 1, '/main/settings', 'settings', 9);

INSERT INTO `role_permission` (`role_id`, `permission_id`) VALUES
  (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7), (1, 8), (1, 9);

INSERT INTO `user` (`id`, `name`, `password`, `avatar_url`, `enable`) VALUES
  (58, 'admin', '0192023a7bbd73250516f069df18b500', '/users/58/avatar', 1);

INSERT INTO `user_role` (`user_id`, `role_id`) VALUES
  (58, 1);

INSERT INTO `avatar` (`filename`, `mimetype`, `size`, `user_id`) VALUES
  ('default.jpg', 'image/jpeg', 0, 58);

INSERT INTO `company` (`id`, `name`) VALUES
  (1, 'Docker 发货公司');

INSERT INTO `memory` (`name`) VALUES
  ('Docker 收货人'),
  ('Docker 发货人');

INSERT INTO `order_list` (
  `id`, `oddnumber`, `billingAt`, `consignee`, `consigneephone`, `address`, `method`,
  `goodsname`, `number`, `pack`, `weight`, `measurement`, `cainsurance`, `value`,
  `insurance`, `consignor`, `consignorphone`, `freight`, `delivery`, `sumfreight`,
  `freightstate`, `paynow`, `paygo`, `payback`, `paymonth`, `receiptnum`, `company`, `remarks`
) VALUES (
  101, 'YH-DOCKER-0001', 1782921600000, 'Docker 收货人', '13800000001', 'Docker 测试地址 1 号', '送货',
  'Docker 测试货物', '12', '纸箱', '120', '3.5', '是', '5000',
  '50', 'Docker 发货人', '13900000002', '320', '30', '350',
  '现付', '350', '0', '0', '0', 2, 'Docker 发货公司', 'Docker E2E 订单样本'
);

INSERT INTO `company_order` (`com_name`, `order_id`) VALUES
  ('Docker 发货公司', 101);

INSERT INTO `receipt` (
  `id`, `oddnumber`, `billingAt`, `recoverystate`, `issuestate`, `poststate`,
  `recoverynumber`, `consignor`, `consignee`, `goodsname`, `goodsnumber`
) VALUES (
  201, 'YH-DOCKER-0001', 1782921600000, '未回收', '未发放', '未寄出',
  2, 'Docker 发货人', 'Docker 收货人', 'Docker 测试货物', '12'
);
