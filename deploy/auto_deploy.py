# -*- coding: utf-8 -*-
"""自动部署 vue-admin 到腾讯云服务器（paramiko 实现，密码经环境变量传入不落盘）。
用法: set DEPLOY_PW=密码 && python auto_deploy.py [ip] [user]
流程: SFTP 上传 tar.gz -> 远程解压并执行 setup.sh（流式打印输出）-> 探测首页
"""
import os
import sys
import time

import paramiko

IP = sys.argv[1] if len(sys.argv) > 1 else "124.220.108.35"
USER = sys.argv[2] if len(sys.argv) > 2 else "root"
PW = os.environ.get("DEPLOY_PW", "")
TAR_LOCAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "vue-admin-server.tar.gz")
TAR_REMOTE = "/root/vue-admin-server.tar.gz"

if not PW:
    print("!! 未设置 DEPLOY_PW 环境变量（服务器密码）")
    sys.exit(1)
if not os.path.exists(TAR_LOCAL):
    print("!! 找不到部署包: " + TAR_LOCAL)
    sys.exit(1)

size_mb = os.path.getsize(TAR_LOCAL) / 1024 / 1024
print(f"==> 连接 {USER}@{IP} ...")
cli = paramiko.SSHClient()
cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cli.connect(IP, username=USER, password=PW, timeout=20, look_for_keys=False, allow_agent=False)
print("==> 连接成功")

# 1) 上传
print(f"==> [1/3] 上传部署包（{size_mb:.1f} MB）...")
sftp = cli.open_sftp()
t0 = time.time()


def progress(transferred, total):
    pct = transferred * 100 // total
    sys.stdout.write(f"\r    {pct}%  ({transferred/1024/1024:.1f}/{total/1024/1024:.1f} MB)")
    sys.stdout.flush()


sftp.put(TAR_LOCAL, TAR_REMOTE, callback=progress)
sftp.close()
print(f"\n    上传完成，用时 {time.time()-t0:.0f} 秒")

# 2) 远程部署（流式输出，最长 15 分钟）
print("==> [2/3] 远程执行部署（装依赖+部署约 2-5 分钟，耐心等）...")
cmd = "cd /root && tar xzf vue-admin-server.tar.gz && bash vue-admin-server/setup.sh 2>&1"
stdin, stdout, stderr = cli.exec_command(cmd, timeout=900, get_pty=True)
for line in iter(stdout.readline, ""):
    sys.stdout.write("    " + line)
    sys.stdout.flush()
rc = stdout.channel.recv_exit_status()
print(f"    setup.sh 退出码: {rc}")

# 3) 探测
print("==> [3/3] 探测服务 ...")
_, so, _ = cli.exec_command("sleep 2; curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1/")
home = so.read().decode().strip()
_, so, _ = cli.exec_command("curl -s -o /dev/null -w '%{http_code}' --max-time 8 -X POST http://127.0.0.1/api/auth/login -H 'Content-Type: application/json' -d '{\"username\":\"x\",\"password\":\"x\"}'")
api = so.read().decode().strip()
cli.close()

print("")
print("=" * 60)
ok = home == "200" and api in ("200", "400", "401")
print(f"  部署{'成功' if ok else '可能异常'}！  首页 HTTP {home} | 登录接口 HTTP {api}")
print(f"  访问地址：http://{IP}")
print("=" * 60)
sys.exit(0 if ok else 2)
