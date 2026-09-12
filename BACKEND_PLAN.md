# 智充回收管理系统 — 后端架构方案

> 前端：Vue 3 + Element Plus + Pinia（已完成）  
> 当前数据层：`src/mock/index.js`（切换后端时删除）

---

## 一、后端语言选型

| 语言/框架 | 优势 | 劣势 | 推荐场景 |
|-----------|------|------|----------|
| **Go + Gin** | 高性能、低资源、并发好、部署简单（单二进制） | 泛型较弱、ORM 不成熟 | ⭐⭐⭐ 推荐 |
| **Java + Spring Boot** | 生态最全、ORM（MyBatis-Plus）强大、招人容易 | 重、启动慢、内存占用大 | ⭐⭐ 传统企业首选 |
| **Node.js + NestJS** | 前后端同语言、开发快、生态丰富 | 性能一般、CPU 密集型弱 | ⭐ 小团队快速开发 |
| **Python + FastAPI** | 开发极快、AI/数据分析友好 | 性能弱、并发差 | AI 相关场景 |

### 推荐：Go + Gin

理由：
- 充电桩 IoT 需要高并发（WebSocket 长连接 + 状态上报）
- 部署简单（单文件 + 配置文件即可）
- 中国 Go 生态成熟（Gin、GORM、go-zero 都有大量中文资料）
- 性能足够支撑 1000+ 充电桩同时在线

如果团队以 Java 为主，Spring Boot 也完全可行。

---

## 二、数据库选型

| 数据库 | 用途 | 为什么 |
|--------|------|--------|
| **PostgreSQL** 或 **MySQL 8.0** | 核心业务库 | 事务支持、JSON 字段、成熟稳定 |
| **Redis** | 缓存 + 会话 + 实时状态 | 充电桩心跳状态、JWT 黑名单、排行榜 |
| **InfluxDB** 或 **TimescaleDB** | 时序数据（可选） | 充电桩历史数据、电量统计 |

### 推荐组合

```
MySQL 8.0（业务数据）+ Redis（缓存/会话/实时状态）
```

- MySQL 因为国内生态最完善、运维人员最多
- Redis 用于充电桩实时状态（WebSocket 推送）、JWT Token 缓存、每日营收缓存

---

## 三、项目结构

```
backend/
├── cmd/
│   └── server/main.go          # 入口
├── internal/
│   ├── config/                  # 配置（yaml/viper）
│   ├── middleware/              # 中间件（JWT、CORS、日志、限流）
│   ├── model/                   # 数据模型（GORM）
│   ├── router/                  # 路由注册
│   ├── controller/              # 控制器（请求处理）
│   │   ├── auth.go              # 登录/登出
│   │   ├── recycle.go           # 回收订单
│   │   ├── charging.go          # 充电桩管理
│   │   ├── inventory.go         # 库存管理
│   │   ├── purchase.go          # 采购管理
│   │   ├── sales.go             # 销售管理
│   │   ├── quotation.go         # 报价竞价
│   │   ├── staff.go             # 员工管理
│   │   ├── channel.go           # 外部渠道
│   │   └── ...
│   ├── service/                 # 业务逻辑层
│   ├── repository/              # 数据访问层（DAO）
│   └── websocket/               # WebSocket 管理
├── pkg/                         # 公共工具
│   ├── jwt/
│   ├── response/                # 统一响应格式
│   └── utils/
├── config.yaml                  # 配置文件
├── go.mod
├── go.sum
├── Dockerfile
└── docker-compose.yaml          # MySQL + Redis + App
```

---

## 四、数据库核心表设计

### 4.1 用户与权限（RBAC）

```sql
-- 用户表
CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    real_name VARCHAR(50),
    phone VARCHAR(20),
    email VARCHAR(100),
    avatar VARCHAR(255),
    dept_id BIGINT,
    status TINYINT DEFAULT 1,       -- 1:正常 0:禁用
    created_at DATETIME DEFAULT NOW(),
    updated_at DATETIME DEFAULT NOW()
);

-- 角色表
CREATE TABLE roles (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,  -- admin/sales/technician
    description VARCHAR(255)
);

-- 用户-角色关联
CREATE TABLE user_roles (
    user_id BIGINT,
    role_id BIGINT,
    PRIMARY KEY (user_id, role_id)
);

-- 权限表
CREATE TABLE permissions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50),
    code VARCHAR(100) UNIQUE        -- recycle:create / inventory:view
);

-- 角色-权限关联
CREATE TABLE role_permissions (
    role_id BIGINT,
    permission_id BIGINT,
    PRIMARY KEY (role_id, permission_id)
);

-- 部门表
CREATE TABLE departments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100),
    parent_id BIGINT DEFAULT 0,
    sort INT DEFAULT 0
);
```

### 4.2 充电桩管理

```sql
CREATE TABLE charging_stations (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    sn VARCHAR(100) NOT NULL UNIQUE,   -- 设备序列号
    type VARCHAR(50),                   -- 超充/快充/交流
    power_kw DECIMAL(8,2),
    lat DECIMAL(10,6),
    lng DECIMAL(10,6),
    address VARCHAR(500),
    total_ports INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'offline',  -- online/offline/fault
    operator_id BIGINT,                 -- 运营商 ID
    channel_code VARCHAR(50),           -- 外部渠道代码
    last_heartbeat DATETIME,
    created_at DATETIME DEFAULT NOW()
);

CREATE TABLE charging_ports (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    station_id BIGINT NOT NULL,
    port_no INT NOT NULL,
    status VARCHAR(20) DEFAULT 'idle',  -- idle/charging/fault
    current_load_kw DECIMAL(8,2),
    vehicle_plate VARCHAR(20),
    charge_start_time DATETIME,
    UNIQUE KEY uk_station_port (station_id, port_no)
);

CREATE TABLE charging_orders (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_no VARCHAR(30) NOT NULL UNIQUE,
    user_id BIGINT,
    station_id BIGINT,
    port_id BIGINT,
    start_time DATETIME,
    end_time DATETIME,
    kwh DECIMAL(10,2),
    duration_min INT,
    unit_price DECIMAL(8,4),
    total_amount DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'pending',  -- pending/charging/completed/cancelled
    created_at DATETIME DEFAULT NOW()
);
```

### 4.3 电池回收

```sql
CREATE TABLE recycle_orders (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_no VARCHAR(30) NOT NULL UNIQUE,
    customer_name VARCHAR(50),
    customer_phone VARCHAR(20),
    battery_type VARCHAR(50),
    battery_brand VARCHAR(100),
    capacity VARCHAR(20),
    weight_kg DECIMAL(10,2),
    price_estimate DECIMAL(10,2),
    price_final DECIMAL(10,2),
    address VARCHAR(500),
    status VARCHAR(20) DEFAULT 'pending',  -- pending/assigned/evaluating/completed/paid
    assessor_id BIGINT,
    remark TEXT,
    created_at DATETIME DEFAULT NOW(),
    updated_at DATETIME DEFAULT NOW()
);

CREATE TABLE recycle_photos (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id BIGINT NOT NULL,
    url VARCHAR(500),
    photo_type VARCHAR(30),             -- overall/nameplate/label/port/damage
    created_at DATETIME DEFAULT NOW()
);

CREATE TABLE recycle_progress (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id BIGINT NOT NULL,
    step VARCHAR(30),                    -- submitted/accepted/visited/completed/paid
    completed_at DATETIME,
    operator_id BIGINT,
    note TEXT
);
```

### 4.4 进销存

```sql
CREATE TABLE products (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    model VARCHAR(100),                  -- 官方型号
    sku VARCHAR(100) NOT NULL UNIQUE,
    category_id BIGINT,
    unit VARCHAR(20),
    cost_price DECIMAL(10,2),
    sale_price DECIMAL(10,2),
    warranty_months INT,
    status VARCHAR(20) DEFAULT 'active'
);

CREATE TABLE categories (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    qc_fields TEXT,                      -- JSON: 质检字段配置
    updated_at DATETIME DEFAULT NOW()
);

CREATE TABLE warehouses (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200),
    code VARCHAR(50) UNIQUE,
    type VARCHAR(50),                    -- main/spare/recycle
    address VARCHAR(500),
    manager_id BIGINT,
    status VARCHAR(20) DEFAULT 'active'
);

CREATE TABLE inventory (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    product_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL,
    quantity DECIMAL(10,2) DEFAULT 0,
    locked_quantity DECIMAL(10,2) DEFAULT 0,   -- 待出库锁定
    safety_stock DECIMAL(10,2) DEFAULT 0,
    UNIQUE KEY uk_product_warehouse (product_id, warehouse_id)
);

CREATE TABLE inventory_logs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    product_id BIGINT,
    warehouse_id BIGINT,
    change_type VARCHAR(30),             -- purchase_in/sales_out/transfer/writeoff/audit
    change_qty DECIMAL(10,2),
    before_qty DECIMAL(10,2),
    after_qty DECIMAL(10,2),
    ref_id BIGINT,                       -- 关联单据 ID
    ref_type VARCHAR(30),                -- purchase_order/sales_order/audit_plan
    created_at DATETIME DEFAULT NOW()
);

CREATE TABLE purchase_orders (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    po_no VARCHAR(30) NOT NULL UNIQUE,
    supplier_id BIGINT,
    payment_terms VARCHAR(50),
    status VARCHAR(20) DEFAULT 'draft',   -- draft/review/qc/inbound/done
    total_amount DECIMAL(12,2),
    tax_rate VARCHAR(10),
    creator_id BIGINT,
    remark TEXT,
    created_at DATETIME DEFAULT NOW()
);

CREATE TABLE purchase_items (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    po_id BIGINT NOT NULL,
    product_name VARCHAR(200),
    quantity DECIMAL(10,2),
    unit_price DECIMAL(10,2)
);

CREATE TABLE sales_orders (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    so_no VARCHAR(30) NOT NULL UNIQUE,
    customer_name VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending',  -- pending/outbound/shipping/done
    total_amount DECIMAL(12,2),
    warehouse_id BIGINT,
    logistics_company VARCHAR(100),
    tracking_no VARCHAR(100),
    created_at DATETIME DEFAULT NOW()
);

CREATE TABLE sales_items (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    so_id BIGINT NOT NULL,
    product_name VARCHAR(200),
    quantity DECIMAL(10,2),
    unit_price DECIMAL(10,2)
);
```

### 4.5 报价竞价 & 渠道 & 供应商

```sql
CREATE TABLE quotations (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(300),
    description TEXT,
    estimate_amount DECIMAL(12,2),
    status VARCHAR(20) DEFAULT 'active',   -- active/closed/done
    deadline DATETIME,
    creator_id BIGINT,
    created_at DATETIME DEFAULT NOW()
);

CREATE TABLE quotation_bids (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    quotation_id BIGINT NOT NULL,
    bidder_name VARCHAR(100),
    bid_amount DECIMAL(12,2),
    submitted_at DATETIME DEFAULT NOW()
);

CREATE TABLE suppliers (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200),
    level VARCHAR(20),                     -- A/B/C
    contact_name VARCHAR(50),
    contact_phone VARCHAR(20),
    payment_terms VARCHAR(50),
    supply_category VARCHAR(200),
    status VARCHAR(20) DEFAULT 'active'
);

CREATE TABLE channels (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100),
    code VARCHAR(50) UNIQUE,
    protocol VARCHAR(50),
    api_url VARCHAR(500),
    api_key VARCHAR(200),
    auth_ttl_min INT,
    heartbeat_sec INT,
    status VARCHAR(20) DEFAULT 'active'
);
```

---

## 五、API 设计规范

### 统一响应格式

```json
{
  "code": 0,          // 0: 成功, 非0: 错误码
  "message": "ok",
  "data": { ... }
}
```

### 分页格式

```json
{
  "code": 0,
  "data": {
    "list": [...],
    "total": 156,
    "page": 1,
    "pageSize": 20
  }
}
```

### 认证方式：JWT

```
Authorization: Bearer <token>

Token 结构:
{
  "user_id": 1,
  "username": "admin",
  "roles": ["admin", "sales"],
  "exp": 1700000000
}

Access Token: 2 小时过期
Refresh Token: 7 天过期，存在 Redis
```

---

## 六、关键中间件

```
请求 → CORS → Logger → RateLimiter → JWT Auth → RBAC → Controller
```

| 中间件 | 说明 |
|--------|------|
| CORS | 跨域配置 |
| Logger | 请求日志（响应时间、状态码） |
| RateLimiter | 限流（登录接口 5次/分钟） |
| JWT Auth | Token 验证（跳过 /api/auth/login） |
| RBAC | 权限校验（根据路由和角色） |

---

## 七、前端改造（接入后端）

当前前端直接 `import { xxx } from '@/mock'`，接入后端时需要：

### Step 1：创建 API 调用函数

```javascript
// src/api/recycle.js
import api from './index'

export function getRecycleOrders(params) {
  return api.get('/recycle/orders', { params })
}

export function createRecycleOrder(data) {
  return api.post('/recycle/orders', data)
}

export function auditRecycleOrder(id, data) {
  return api.put(`/recycle/orders/${id}/audit`, data)
}
```

### Step 2：改造页面

```javascript
// 之前：
import { recycleOrders } from '@/mock'
const orders = ref(recycleOrders.list)

// 之后：
import { getRecycleOrders } from '@/api/recycle'
const orders = ref([])
const loading = ref(false)

async function fetchOrders() {
  loading.value = true
  const res = await getRecycleOrders({ status: filterTab.value })
  orders.value = res.data.list
  loading.value = false
}

onMounted(() => fetchOrders())
```

### Step 3：删除 mock

```bash
rm src/mock/index.js
```

---

## 八、部署架构

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Nginx     │────▶│  Go App :8080 │────▶│  MySQL 3306  │
│  (静态资源)  │     │  (API 服务)   │     │  (业务数据)   │
│  port 80    │     └──────┬───────┘     └─────────────┘
└─────────────┘            │
       │                   │              ┌─────────────┐
       │                   └──────────────│  Redis 6379  │
       │                                  │  (缓存/会话)  │
       │                                  └─────────────┘
       │
       ▼
┌─────────────┐
│  Vue SPA     │   ← 前端打包后放 Nginx 或 CDN
│  (dist/)     │
└─────────────┘
```

### Docker Compose 一键启动

```yaml
version: '3.8'
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root123
      MYSQL_DATABASE: recycle_db
    ports: ["3306:3306"]
    volumes: ["./data/mysql:/var/lib/mysql"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  app:
    build: .
    ports: ["8080:8080"]
    depends_on: [mysql, redis]
    environment:
      DB_DSN: "root:root123@tcp(mysql:3306)/recycle_db"
      REDIS_ADDR: "redis:6379"
```

---

## 九、开发路线图

```
Week 1-2: 基础框架
  ├── Go 项目初始化（Gin + GORM + Viper）
  ├── 数据库建表 + 自动迁移
  ├── JWT 认证 + RBAC 中间件
  └── 统一响应格式 + 错误处理

Week 3-4: 核心 CRUD
  ├── 用户/角色/权限 API
  ├── 充电站 + 充电桩 API
  ├── 回收订单 API（CRUD + 状态流转）
  └── 产品/分类/供应商/仓库 API

Week 5-6: 进销存流程
  ├── 库存查询 + 调拨 + 核销
  ├── 采购单流程（draft→review→qc→inbound）
  ├── 销售单流程（pending→outbound→shipping→done）
  └── 库存日志（每次变更自动记录）

Week 7-8: 报价 + 渠道 + WebSocket
  ├── 报价竞价 API（创建/出价/截止）
  ├── 外部渠道对接 API（/v1/order/sync 等）
  ├── WebSocket：充电桩状态实时推送
  └── 前端联调 + 切换 mock → API

Week 9-10: 部署 + 测试
  ├── Docker 镜像 + docker-compose
  ├── Nginx 配置（反向代理 + 静态资源）
  ├── 接口测试 + 压测
  └── 文档 + 部署手册
```

---

## 十、推荐 Go 依赖包

```go
// go.mod
require (
    github.com/gin-gonic/gin          // Web 框架
    gorm.io/gorm                       // ORM
    gorm.io/driver/mysql              // MySQL 驱动
    github.com/golang-jwt/jwt/v5      // JWT
    github.com/go-redis/redis/v9      // Redis
    github.com/spf13/viper            // 配置管理
    github.com/gorilla/websocket      // WebSocket
    go.uber.org/zap                   // 日志
    github.com/swaggo/gin-swagger     // API 文档
)
```

---

*文档时间：2026-07-26 | 基于前端原型分析 + 国内业务场景*
