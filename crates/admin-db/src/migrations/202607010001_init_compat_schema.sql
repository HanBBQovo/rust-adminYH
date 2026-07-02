-- AdminYH legacy-compatible schema baseline.
--
-- This first baseline intentionally keeps legacy table and column names so old
-- data can be migrated without semantic conversion. It avoids hard referential constraints
-- and unique constraints because the old database can contain historical
-- duplicates and weak text relations that must be reported before cleanup.

CREATE TABLE IF NOT EXISTS `role` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `intro` VARCHAR(500) NULL,
    `createAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updateAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_role_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `permission` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `pid` BIGINT NULL DEFAULT 0,
    `name` VARCHAR(255) NOT NULL,
    `type` INT NOT NULL DEFAULT 1,
    `url` VARCHAR(500) NULL,
    `icon` VARCHAR(255) NULL,
    `sort` INT NOT NULL DEFAULT 0,
    `createAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updateAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_permission_pid` (`pid`),
    INDEX `idx_permission_type_sort` (`type`, `sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `avatar_url` VARCHAR(500) NULL,
    `token` TEXT NULL,
    `enable` TINYINT NOT NULL DEFAULT 1,
    `createAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updateAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_user_name` (`name`),
    INDEX `idx_user_enable` (`enable`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `company` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `createAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updateAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_company_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `memory` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `createAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updateAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_memory_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `avatar` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `filename` VARCHAR(500) NOT NULL,
    `mimetype` VARCHAR(255) NOT NULL,
    `size` BIGINT NOT NULL DEFAULT 0,
    `user_id` BIGINT NOT NULL,
    `createAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updateAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_avatar_user_id` (`user_id`),
    INDEX `idx_avatar_filename` (`filename`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_role` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `role_id` BIGINT NOT NULL,
    `createAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updateAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_user_role_user_id` (`user_id`),
    INDEX `idx_user_role_role_id` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `role_permission` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `role_id` BIGINT NOT NULL,
    `permission_id` BIGINT NOT NULL,
    `createAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updateAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_role_permission_role_id` (`role_id`),
    INDEX `idx_role_permission_permission_id` (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_list` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `oddnumber` VARCHAR(255) NOT NULL,
    `billingAt` BIGINT NOT NULL DEFAULT 0,
    `consignee` VARCHAR(255) NOT NULL DEFAULT '',
    `consigneephone` VARCHAR(255) NOT NULL DEFAULT '',
    `address` VARCHAR(1000) NOT NULL DEFAULT '',
    `method` VARCHAR(255) NOT NULL DEFAULT '',
    `goodsname` VARCHAR(255) NOT NULL DEFAULT '',
    `number` VARCHAR(255) NOT NULL DEFAULT '',
    `pack` VARCHAR(255) NOT NULL DEFAULT '',
    `weight` VARCHAR(255) NOT NULL DEFAULT '',
    `measurement` VARCHAR(255) NOT NULL DEFAULT '',
    `cainsurance` VARCHAR(255) NOT NULL DEFAULT '',
    `value` VARCHAR(255) NOT NULL DEFAULT '',
    `insurance` VARCHAR(255) NOT NULL DEFAULT '',
    `consignor` VARCHAR(255) NOT NULL DEFAULT '',
    `consignorphone` VARCHAR(255) NOT NULL DEFAULT '',
    `freight` VARCHAR(255) NOT NULL DEFAULT '',
    `delivery` VARCHAR(255) NOT NULL DEFAULT '',
    `sumfreight` VARCHAR(255) NOT NULL DEFAULT '',
    `freightstate` VARCHAR(255) NOT NULL DEFAULT '',
    `paynow` VARCHAR(255) NOT NULL DEFAULT '',
    `paygo` VARCHAR(255) NOT NULL DEFAULT '',
    `payback` VARCHAR(255) NOT NULL DEFAULT '',
    `paymonth` VARCHAR(255) NOT NULL DEFAULT '',
    `receiptnum` BIGINT NOT NULL DEFAULT 0,
    `company` VARCHAR(255) NOT NULL DEFAULT '',
    `remarks` TEXT NULL,
    `createAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updateAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_order_oddnumber` (`oddnumber`),
    INDEX `idx_order_billingAt` (`billingAt`),
    INDEX `idx_order_company` (`company`),
    INDEX `idx_order_consignee` (`consignee`),
    INDEX `idx_order_consignor` (`consignor`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `company_order` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `com_name` VARCHAR(255) NOT NULL,
    `order_id` BIGINT NOT NULL,
    `createAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updateAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_company_order_com_name` (`com_name`),
    INDEX `idx_company_order_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `receipt` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `oddnumber` VARCHAR(255) NOT NULL,
    `billingAt` BIGINT NOT NULL DEFAULT 0,
    `recoverystate` VARCHAR(255) NOT NULL DEFAULT '未回收',
    `issuestate` VARCHAR(255) NOT NULL DEFAULT '未发放',
    `poststate` VARCHAR(255) NOT NULL DEFAULT '未寄出',
    `recoverynumber` BIGINT NOT NULL DEFAULT 0,
    `consignor` VARCHAR(255) NOT NULL DEFAULT '',
    `consignee` VARCHAR(255) NOT NULL DEFAULT '',
    `goodsname` VARCHAR(255) NOT NULL DEFAULT '',
    `goodsnumber` VARCHAR(255) NOT NULL DEFAULT '',
    `createAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updateAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_receipt_oddnumber` (`oddnumber`),
    INDEX `idx_receipt_billingAt` (`billingAt`),
    INDEX `idx_receipt_states` (`recoverystate`, `issuestate`, `poststate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
