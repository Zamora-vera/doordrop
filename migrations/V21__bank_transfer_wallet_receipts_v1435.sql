-- Ship24Go V1.4.35 — Bank transfer wallet receipts
CREATE TABLE IF NOT EXISTS bank_accounts (
  id VARCHAR(80) PRIMARY KEY,
  code VARCHAR(80) NOT NULL,
  currency CHAR(3) NOT NULL,
  country_code VARCHAR(10) NULL,
  account_holder VARCHAR(191) NOT NULL,
  bank_name VARCHAR(191) NOT NULL,
  bank_address VARCHAR(255) NULL,
  details_json JSON NULL,
  instructions_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bank_accounts_currency_active (currency, is_active),
  INDEX idx_bank_accounts_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_receipts (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  bank_account_id VARCHAR(80) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reference_number VARCHAR(191) NULL,
  payer_name VARCHAR(191) NULL,
  note TEXT NULL,
  receipt_file_url VARCHAR(600) NULL,
  admin_note TEXT NULL,
  reviewed_by CHAR(36) NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_payment_receipts_user (user_id, status),
  INDEX idx_payment_receipts_status (status, created_at),
  CONSTRAINT fk_payment_receipts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_receipts_bank FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


SET @ship24go_db := DATABASE();
SET @sql := (SELECT IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@ship24go_db AND table_name='wallet_topups') AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@ship24go_db AND table_name='wallet_topups' AND column_name='receipt_id'), 'ALTER TABLE wallet_topups ADD COLUMN receipt_id CHAR(36) NULL', 'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := (SELECT IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@ship24go_db AND table_name='wallet_topups') AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@ship24go_db AND table_name='wallet_topups' AND column_name='proof_url'), 'ALTER TABLE wallet_topups ADD COLUMN proof_url VARCHAR(600) NULL', 'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := (SELECT IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=@ship24go_db AND table_name='wallet_transactions') AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=@ship24go_db AND table_name='wallet_transactions' AND column_name='admin_note'), 'ALTER TABLE wallet_transactions ADD COLUMN admin_note TEXT NULL', 'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


INSERT INTO bank_accounts (id, code, currency, country_code, account_holder, bank_name, bank_address, details_json, instructions_json, is_active, sort_order)
VALUES
('bank_wise_eur_tatiana','wise_eur_tatiana','EUR','EU','Tatiana Monserrate Zamora Vera','Wise','Wise, Rue du Trône 100, 3rd floor, Brussels, 1050, Belgium',
 JSON_OBJECT('IBAN','BE57 9672 5288 5935','Swift/BIC','TRWIBEB1XXX'),
 JSON_OBJECT('es','Para transferencias SEPA usa el IBAN. Para transferencias desde fuera del área SEPA usa Swift/BIC.','en','Use the IBAN for SEPA transfers. For transfers from outside the SEPA area, use Swift/BIC.','it','Per bonifici SEPA usa l’IBAN. Per trasferimenti da fuori area SEPA usa Swift/BIC.','fr','Utilisez l’IBAN pour les virements SEPA. Pour les virements hors zone SEPA, utilisez Swift/BIC.','de','Für SEPA-Überweisungen nutzen Sie die IBAN. Für Überweisungen außerhalb des SEPA-Raums nutzen Sie Swift/BIC.','zh','SEPA 转账请使用 IBAN。SEPA 区域外转账请使用 Swift/BIC。'),
 1, 10),
('bank_wise_gbp_tatiana','wise_gbp_tatiana','GBP','GB','Tatiana Monserrate Zamora Vera','Wise Payments Limited','Wise Payments Limited, 1st Floor, Worship Square, 65 Clifton Street, London, EC2A 4JE, United Kingdom',
 JSON_OBJECT('Account number','94944449','Sort code','23-14-70','IBAN','GB61 TRWI 2314 7094 9444 49','Swift/BIC','TRWIGB2LXXX'),
 JSON_OBJECT('es','Para transferencias desde Reino Unido usa account number y sort code. Para transferencias internacionales usa IBAN o Swift/BIC.','en','For UK domestic transfers use account number and sort code. For international transfers use IBAN or Swift/BIC.','it','Per bonifici dal Regno Unito usa account number e sort code. Per trasferimenti internazionali usa IBAN o Swift/BIC.','fr','Pour les virements au Royaume-Uni, utilisez account number et sort code. Pour les virements internationaux, utilisez IBAN ou Swift/BIC.','de','Für Inlandsüberweisungen im Vereinigten Königreich nutzen Sie Account Number und Sort Code. Für internationale Überweisungen nutzen Sie IBAN oder Swift/BIC.','zh','英国本地转账请使用账号和 Sort Code。国际转账请使用 IBAN 或 Swift/BIC。'),
 1, 20),
('bank_wise_usd_tatiana','wise_usd_tatiana','USD','US','Tatiana Monserrate Zamora Vera','Community Federal Savings Bank','Community Federal Savings Bank, 89-16 Jamaica Ave, Woodhaven, NY, 11421, United States',
 JSON_OBJECT('Account type','Checking','Routing number (wire and ACH)','026073150','Account number','8311393981','Swift/BIC','CMFGUS33'),
 JSON_OBJECT('es','Para transferencias desde Estados Unidos usa routing number y número de cuenta. Para transferencias internacionales usa Swift/BIC.','en','For US domestic transfers use routing number and account number. For international transfers use Swift/BIC.','it','Per bonifici dagli Stati Uniti usa routing number e account number. Per trasferimenti internazionali usa Swift/BIC.','fr','Pour les virements depuis les États-Unis, utilisez routing number et account number. Pour les virements internationaux, utilisez Swift/BIC.','de','Für Inlandsüberweisungen in den USA nutzen Sie Routing Number und Account Number. Für internationale Überweisungen nutzen Sie Swift/BIC.','zh','美国本地转账请使用 routing number 和账号。国际转账请使用 Swift/BIC。'),
 1, 30),
('bank_bhd_dop_tatiana','bhd_dop_tatiana','DOP','DO','TATIANA ZAMORA','Banco BHD','LEONARDO DA VINCI #87, Los Cacicazgos, Santo Domingo de Guzmán',
 JSON_OBJECT('Documento de identidad','A3981914','Correo electrónico','tatyvera938@gmail.com','Cuenta de ahorros RD$','33960360019','Swift','BCBHDOSDXXX','Cuenta estándar','DO02BCBH00000000033960360019'),
 JSON_OBJECT('es','Cuenta local para República Dominicana en pesos dominicanos. Sube el comprobante después de realizar la transferencia.','en','Local Dominican Republic account in Dominican pesos. Upload the receipt after completing the transfer.','it','Conto locale per Repubblica Dominicana in pesos dominicani. Carica la ricevuta dopo aver effettuato il trasferimento.','fr','Compte local pour la République dominicaine en pesos dominicains. Téléversez le reçu après le virement.','de','Lokales Konto für die Dominikanische Republik in dominikanischen Pesos. Laden Sie den Zahlungsbeleg nach der Überweisung hoch.','zh','多米尼加共和国本地多米尼加比索账户。转账完成后请上传付款凭证。'),
 1, 40)
ON DUPLICATE KEY UPDATE
  code = VALUES(code), currency = VALUES(currency), country_code = VALUES(country_code), account_holder = VALUES(account_holder), bank_name = VALUES(bank_name), bank_address = VALUES(bank_address), details_json = VALUES(details_json), instructions_json = VALUES(instructions_json), is_active = VALUES(is_active), sort_order = VALUES(sort_order), updated_at = CURRENT_TIMESTAMP;
