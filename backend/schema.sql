-- schema.sql — 规范化关系表（SQLite）
-- 设计原则：
--   1. 每个业务实体一张表，原子字段拆列，嵌套 list 拆子表
--   2. 能用外键强制的关系就用 FK（分类/部门/角色/批次从属/订单明细从属）
--   3. 演示数据里命名不一致的引用（供应商名、仓库名）先以 TEXT 存，
--      待真实数据接入时再做标准化（见迁移脚本注释）
-- 全部 IF NOT EXISTS，可重复执行。

PRAGMA foreign_keys = ON;

-- ── 基础字典 ──
CREATE TABLE IF NOT EXISTS categories (
  id        INTEGER PRIMARY KEY,
  name      TEXT UNIQUE NOT NULL,
  qc_fields TEXT,
  updated   TEXT
);

CREATE TABLE IF NOT EXISTS departments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT UNIQUE NOT NULL,
  permissions TEXT        -- JSON 数组
);

-- ── 账号与人员 ──
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  real_name    TEXT,
  role_id      INTEGER REFERENCES roles(id),
  dept_id      INTEGER REFERENCES departments(id),
  status       INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS staff (
  id       INTEGER PRIMARY KEY,
  name     TEXT,
  username TEXT,
  dept_id  INTEGER REFERENCES departments(id),
  role     TEXT,
  status   TEXT
);

-- ── 供应链主数据 ──
CREATE TABLE IF NOT EXISTS suppliers (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,
  level   TEXT,
  contact TEXT,
  phone   TEXT,
  terms   TEXT,
  category TEXT,
  status  TEXT
);

CREATE TABLE IF NOT EXISTS warehouses (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,
  code    TEXT,
  type    TEXT,
  manager TEXT,
  phone   TEXT,
  address TEXT,
  status  TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id         INTEGER PRIMARY KEY,
  name       TEXT,
  model      TEXT,
  sku        TEXT UNIQUE,
  category   TEXT REFERENCES categories(name),
  unit       TEXT,
  cost_price REAL,
  sale_price REAL,
  status     TEXT
);

-- ── 库存（含批次子表，FK 强制从属）──
CREATE TABLE IF NOT EXISTS stock_items (
  id        INTEGER PRIMARY KEY,
  name      TEXT,
  sku       TEXT,
  category  TEXT,
  qty       INTEGER,
  unit      TEXT,
  locked    INTEGER DEFAULT 0,
  warehouse TEXT,          -- 演示数据中仓库名与主数据不一致，暂存 TEXT
  cost_price REAL,
  value     REAL
);

CREATE TABLE IF NOT EXISTS stock_batches (
  id               TEXT PRIMARY KEY,
  stock_item_id    INTEGER REFERENCES stock_items(id) ON DELETE CASCADE,
  batch_no         TEXT,
  mfd              TEXT,
  amount           INTEGER,
  health           INTEGER,
  recycle_order_id TEXT,
  purchase_order_id TEXT  -- 关联 purchase_orders.id（INTEGER 主键）或 po_no（TEXT）
);

-- ── 销售订单（含明细子表，FK 强制从属）──
CREATE TABLE IF NOT EXISTS sales_orders (
  id              TEXT PRIMARY KEY,
  customer        TEXT,
  product_summary TEXT,
  item_count      INTEGER,
  total           TEXT,
  gp              INTEGER,
  status          TEXT,
  time            TEXT,
  logistics_co    TEXT,
  tracking_no     TEXT,
  received_amount TEXT,
  balance         TEXT
);

CREATE TABLE IF NOT EXISTS sales_order_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_order_id   TEXT REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_name     TEXT,
  price            TEXT,
  amount           INTEGER,
  selected_item_id TEXT
);

-- ── 采购订单 ──
CREATE TABLE IF NOT EXISTS purchase_orders (
  id            INTEGER PRIMARY KEY,
  po_no         TEXT,
  supplier      TEXT,     -- 演示数据供应商名与主数据不一致，暂存 TEXT
  payment_terms TEXT,
  item          TEXT,
  unit_price    REAL,
  qty           INTEGER,
  amount        REAL,
  tax_rate      TEXT,
  status        TEXT,
  recycle_order_id TEXT,  -- 来源回收单号（FK → recycle_orders.id）；直采为 NULL
  warehouse_id  TEXT,    -- 目标仓库号（FK → warehouses.id）；空时回退至默认仓库
  source_type   TEXT DEFAULT 'direct'  -- direct=直接采购 / recycle=回收单入库
);

-- ── 采购明细子表（一个 PO 可有多种资产行项目）──
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  po_no         TEXT NOT NULL,           -- 关联 purchase_orders.po_no
  product_name  TEXT,
  spec          TEXT,
  serial_no     TEXT,                    -- 序列号 / 批次号
  qty           INTEGER,
  unit          TEXT DEFAULT '组',       -- 组 / 件 / 块 / kWh
  unit_price    REAL,
  amount        REAL,                    -- 行金额 = qty * unit_price
  stock_item_id INTEGER,                 -- 入库目标 stock_items.id
  recycle_order_id TEXT                  -- 冗余：方便追溯到回收单
);

CREATE INDEX IF NOT EXISTS idx_po_items_po_no ON purchase_order_items(po_no);

-- ── 回收订单 ──
CREATE TABLE IF NOT EXISTS recycle_orders (
  id                TEXT PRIMARY KEY,
  user_name         TEXT,
  phone             TEXT,
  brand             TEXT,
  type              TEXT,
  count             INTEGER,
  capacity          TEXT,
  valuation         TEXT,    -- 应付总额 = sum(items.amount)；与 recycle_order_items 联动
  status            TEXT,
  time              TEXT,
  payment_applied   INTEGER,
  paid              INTEGER,
  paid_amount       TEXT,
  address           TEXT,
  payee_channel     TEXT,   -- 客户收款渠道：微信 / 支付宝 / 银联云闪付 / 银行卡转账
  payee_wechat_qr   TEXT,   -- 客户微信收款码（base64 data URI）
  payee_alipay_qr   TEXT,   -- 客户支付宝收款码
  payee_unionpay_qr TEXT,   -- 客户银联云闪付收款码
  payee_bank_holder TEXT,   -- 收款户名
  payee_bank_name   TEXT,   -- 开户行
  payee_bank_branch TEXT,   -- 开户支行
  payee_bank_account TEXT,  -- 银行账号
  audit_time              TEXT, -- 管理员审核通过时间
  payment_applied_time    TEXT, -- 业务员提交资金申请时间
  paid_time               TEXT, -- 财务完成打款时间
  completed_time          TEXT, -- 上门回收完成时间
  return_applied          INTEGER DEFAULT 0, -- 退货/退款状态：0=正常 1=退货处理中 2=退货完成（财务已确认退款到账）
  return_time             TEXT, -- 退货发起时间
  return_done_time        TEXT, -- 退货完成（退款到账确认）时间
  return_flow_id          INTEGER  -- 关联 settlement_flows.id（退货退款支出流水）
);

-- ── 回收订单明细行（资产明细构成）──
-- 一张主单对应 N 条明细；前端"资产明细构成"表读这里
CREATE TABLE IF NOT EXISTS recycle_order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     TEXT NOT NULL,           -- 关联 recycle_orders.id
  product_id   TEXT,                    -- 商品档案 id（products.id），可空
  product_name TEXT,                    -- 资产描述主标题（如 "动力电池组"）
  spec         TEXT,                    -- 规格/兼容说明（如 "75kWh 翻新"）
  serial_no    TEXT,                    -- 序列号/批次号
  qty          INTEGER DEFAULT 1,       -- 数量
  unit         TEXT DEFAULT '组',       -- 单位
  unit_price   TEXT DEFAULT '0',        -- 回收单价（逗号 TEXT，与全库金额风格一致）
  amount       TEXT DEFAULT '0',        -- 行金额 = qty * unit_price
  need_dismantle INTEGER DEFAULT 0,     -- 是否需要拆解
  remark       TEXT,
  created_at   TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (order_id) REFERENCES recycle_orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_recycle_items_order ON recycle_order_items(order_id);

-- ── 系统通知 ──
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT DEFAULT 'system',   -- recycle / order / stock / system
  title      TEXT,
  content    TEXT,
  ref_id     TEXT,                    -- 关联单号（回收单号等）
  source     TEXT DEFAULT 'system',   -- miniapp / system
  read       INTEGER DEFAULT 0,       -- 0 未读 1 已读
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

-- ── C 端客户（按手机号归集）──
CREATE TABLE IF NOT EXISTS customers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  phone           TEXT UNIQUE,
  name            TEXT,                -- 联系人（小程序恒为「微信用户」，运营可改）
  address         TEXT,
  order_count     INTEGER DEFAULT 0,
  total_value     TEXT DEFAULT '0',    -- 回收总额（逗号 TEXT）
  first_order_no  TEXT,
  last_order_time TEXT,
  status          TEXT DEFAULT '活跃', -- 活跃 / 沉默 / 黑名单
  created_at      TEXT DEFAULT (datetime('now','localtime')),
  updated_at      TEXT
);

-- ── 报价/竞价 ──
CREATE TABLE IF NOT EXISTS quotations (
  id         INTEGER PRIMARY KEY,
  project    TEXT,
  project_id TEXT,
  type       TEXT,
  status     TEXT,
  bidders    INTEGER,
  views      INTEGER,
  top_bid    REAL,
  premium    INTEGER,
  deadline   TEXT
);

-- ── 盘点计划 ──
CREATE TABLE IF NOT EXISTS audit_plans (
  id       INTEGER PRIMARY KEY,
  plan_no  TEXT,
  warehouse TEXT,
  range    TEXT,
  progress INTEGER,
  status   TEXT,
  note     TEXT
);

-- ── 反馈 ──
CREATE TABLE IF NOT EXISTS feedbacks (
  id      INTEGER PRIMARY KEY,
  user    TEXT,
  type    TEXT,
  content TEXT,
  status  TEXT,
  time    TEXT
);

-- ── 收付款流水（业绩结算）──
CREATE TABLE IF NOT EXISTS settlement_flows (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  time       TEXT,
  type       TEXT,
  order_id   TEXT,
  amount     TEXT,
  account    TEXT,
  item_class TEXT,
  payee      TEXT,
  payee_no   TEXT,
  status     TEXT
);

-- ── 支付执行日志（事务留痕）──
CREATE TABLE IF NOT EXISTS pay_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  flow_id       INTEGER REFERENCES settlement_flows(id) ON DELETE CASCADE,
  paid_amount   TEXT,
  account       TEXT,
  item_class    TEXT,
  channel       TEXT,
  operator      TEXT,
  created_at    TEXT DEFAULT (datetime('now','localtime'))
);

-- ── 库存核销记录 ──
CREATE TABLE IF NOT EXISTS stock_writeoffs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_item_id INTEGER,
  batch_id     TEXT,
  qty          INTEGER,
  reason       TEXT,
  operator     TEXT,
  created_at   TEXT DEFAULT (datetime('now','localtime'))
);

-- ── 盘点结果明细 ──
CREATE TABLE IF NOT EXISTS audit_results (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id       INTEGER REFERENCES audit_plans(id) ON DELETE CASCADE,
  stock_item_id INTEGER,
  book_qty      INTEGER,
  real_qty      INTEGER,
  diff          INTEGER,
  created_at    TEXT DEFAULT (datetime('now','localtime'))
);

-- ── 供应商付款记录 ──
CREATE TABLE IF NOT EXISTS supplier_payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pay_no       TEXT,
  supplier     TEXT,
  amount       TEXT,           -- 本次实付（逗号格式 TEXT）
  account      TEXT,           -- 出款账户
  channel      TEXT,           -- 支付宝码 / 微信码 / 银行转账
  payee        TEXT,           -- 收款户名
  bank_account TEXT,
  bank_name    TEXT,
  status       TEXT,           -- 已付款
  operator     TEXT,
  remark       TEXT,
  allocation   TEXT,           -- JSON：本次覆盖的采购单明细
  created_at   TEXT DEFAULT (datetime('now','localtime'))
);

-- ── 派生/配置（原 entities 里的 dashboardStats / workbench）──
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ── 报价竞价明细 ──
CREATE TABLE IF NOT EXISTS quotation_bids (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id  TEXT,
  name          TEXT,
  price         TEXT,
  credit        TEXT,
  payment       TEXT,
  time          TEXT,
  is_best       INTEGER DEFAULT 0,
  items_json    TEXT,
  phone         TEXT,
  logistics     TEXT
);

-- ── 支付账户（财务出纳可维护，业绩结算中心使用）──
CREATE TABLE IF NOT EXISTS payment_accounts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT,
  no         TEXT,
  type       TEXT,          -- bank / wechat / alipay
  balance    TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- ── 月度绩效/提成记录（业绩结算中心，commission-settle 读写）──
CREATE TABLE IF NOT EXISTS commissions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  month          TEXT,        -- 结算月份，如 2024-04
  staff_name     TEXT,
  dept           TEXT,
  recycle_val    TEXT,        -- 回收业绩（逗号 TEXT）
  sales_val      TEXT,        -- 销售业绩
  base           TEXT,        -- 基数 = 回收 + 销售
  rate           REAL,        -- 提成比例（%）
  final_amount   TEXT,        -- 应发提成
  status         TEXT DEFAULT '待发放',   -- 待发放 / 已发放
  settled_at     TEXT,
  operator       TEXT,
  audit_status   TEXT DEFAULT '未审核',   -- 未审核 / 已审核 / 已驳回
  auditor        TEXT,                    -- 审核人（操作员姓名）
  audit_time     TEXT,                    -- 审核时间
  audit_comment  TEXT,                    -- 审核意见（驳回时必填）
  created_at     TEXT DEFAULT (datetime('now','localtime'))
);

-- ── 费用报销单（小程序端提交 / 后台审批）──
-- 字段与小程序 expenseStore 对齐：M2 后小程序改为直接写本表
CREATE TABLE IF NOT EXISTS expense_claims (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_no       TEXT,                  -- 单号 EXP-YYYYMMDD-NN
  applicant      TEXT,                  -- 申请人（姓名/昵称）
  role           TEXT DEFAULT 'user',   -- salesman=业务员 / user=普通用户
  type           TEXT,                  -- 费用类型：差旅费/交通费/业务招待费/办公费/车辆使用费/其他
  amount         TEXT,                  -- 金额（逗号格式 TEXT，与全库金额风格一致）
  date           TEXT,                  -- 费用发生日期 YYYY-MM-DD
  invoice_count  INTEGER DEFAULT 0,     -- 发票张数
  reason         TEXT,                  -- 报销事由
  status         TEXT DEFAULT '待审批',  -- 待审批 / 已通过 / 已驳回 / 已撤销
  review_remark  TEXT,                  -- 审批意见（驳回时必填）
  review_time    TEXT,                  -- 审批时间
  attachments    TEXT,                  -- JSON：[{kind:'image'|'file', name, path, size}]
  created_at     TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_expense_status ON expense_claims(status);
CREATE INDEX IF NOT EXISTS idx_expense_created ON expense_claims(created_at);

-- ── 物流运输单（取货 → 运输 → 到达 → 入库）──
-- 小程序/后台均可发起：登记取货地址、货物、件数、预计几天到达；
-- 后台推进状态：待取货 → 运输中 → 已到达 → 已入库（tx logistics-inbound 入库时加库存+建批次）。
CREATE TABLE IF NOT EXISTS logistics_orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  lg_no          TEXT UNIQUE,             -- 单号 LG-YYYYMMDD-NN
  applicant      TEXT,                    -- 发起人（姓名/昵称）
  pickup_address TEXT,                    -- 取货地址
  goods          TEXT,                    -- 货物描述（如：75kWh 动力电池组）
  qty            INTEGER DEFAULT 0,       -- 件数
  eta_days       INTEGER DEFAULT 1,       -- 预计几天到达
  expect_date    TEXT,                    -- 预计到达日期（YYYY-MM-DD）
  dest_warehouse TEXT,                    -- 入库目标仓库（名称，入库时用）
  carrier        TEXT,                    -- 承运方/司机
  carrier_phone  TEXT,                    -- 承运联系电话
  status         TEXT DEFAULT '待取货',   -- 待取货 / 运输中 / 已到达 / 已入库 / 已取消
  remark         TEXT,
  source         TEXT DEFAULT 'manual',   -- miniapp / manual
  pickup_time    TEXT,                    -- 确认取货时间
  arrive_time    TEXT,                    -- 确认到达时间
  inbound_time   TEXT,                    -- 入库完成时间
  created_at     TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_logistics_status  ON logistics_orders(status);
CREATE INDEX IF NOT EXISTS idx_logistics_created ON logistics_orders(created_at);

-- ── 索引 ──
CREATE INDEX IF NOT EXISTS idx_stock_batches_item ON stock_batches(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_so_items_so       ON sales_order_items(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_staff_dept        ON staff(dept_id);
CREATE INDEX IF NOT EXISTS idx_po_supplier       ON purchase_orders(supplier);
CREATE INDEX IF NOT EXISTS idx_pay_logs_flow      ON pay_logs(flow_id);
CREATE INDEX IF NOT EXISTS idx_audit_results_plan ON audit_results(plan_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier);
CREATE INDEX IF NOT EXISTS idx_settlement_flows_time    ON settlement_flows(time);
CREATE INDEX IF NOT EXISTS idx_recycle_orders_phone    ON recycle_orders(phone);
CREATE INDEX IF NOT EXISTS idx_recycle_orders_status   ON recycle_orders(status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_time       ON sales_orders(time);
CREATE INDEX IF NOT EXISTS idx_quotations_status       ON quotations(status);
