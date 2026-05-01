-- Schema SQL unico per inizializzare il database MySQL di Paroletta
-- Generato in base a db/schema.ts

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `unionId` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NULL,
  `email` VARCHAR(320) NULL,
  `passwordHash` VARCHAR(255) NULL,
  `avatar` TEXT NULL,
  `role` ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `lastSignInAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `firstName` VARCHAR(100) NULL,
  `lastName` VARCHAR(100) NULL,
  `piano` ENUM('trial', 'base') NULL DEFAULT 'trial',
  `seats` INT NULL DEFAULT 1,
  `schedeMese` INT NULL DEFAULT 0,
  `trialSchedeUsate` INT NULL DEFAULT 0,
  `teamId` BIGINT UNSIGNED NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_unionId_unique` (`unionId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `patients` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `userId` BIGINT UNSIGNED NOT NULL,
  `aliasEta` VARCHAR(50) NULL,
  `noteAnonime` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `patients_userId_idx` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sheets` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `userId` BIGINT UNSIGNED NOT NULL,
  `patientId` BIGINT UNSIGNED NULL,
  `fonema` VARCHAR(10) NOT NULL,
  `interesse` VARCHAR(100) NOT NULL,
  `tipoOutput` ENUM('storia', 'filastrocca', 'lista') NOT NULL,
  `testoGenerato` TEXT NOT NULL,
  `tagImmagine` VARCHAR(100) NULL,
  `listaParole` JSON NULL,
  `difficolta` ENUM('bassa', 'media', 'alta') NULL DEFAULT 'media',
  `pdfUrl` VARCHAR(500) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `sheets_userId_idx` (`userId`),
  KEY `sheets_patientId_idx` (`patientId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `illustrations` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tag` VARCHAR(100) NOT NULL,
  `filePath` VARCHAR(500) NOT NULL,
  `categoria` VARCHAR(100) NULL,
  `etaTarget` VARCHAR(20) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `userId` BIGINT UNSIGNED NOT NULL,
  `stripeSubId` VARCHAR(100) NULL,
  `status` ENUM('attivo', 'scaduto', 'cancellato', 'trial') NOT NULL DEFAULT 'trial',
  `currentPeriodEnd` TIMESTAMP NULL,
  `seatsCount` INT NULL DEFAULT 1,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `subscriptions_userId_idx` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `teams` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `adminUserId` BIGINT UNSIGNED NOT NULL,
  `piano` ENUM('base') NOT NULL,
  `seatsTotal` INT NOT NULL,
  `seatsUsate` INT NULL DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `teams_adminUserId_idx` (`adminUserId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `team_members` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `teamId` BIGINT UNSIGNED NOT NULL,
  `userId` BIGINT UNSIGNED NOT NULL,
  `role` ENUM('admin', 'member') NOT NULL DEFAULT 'member',
  `invitedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `joinedAt` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `team_members_teamId_idx` (`teamId`),
  KEY `team_members_userId_idx` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
