# Stella AI Sales OS — 云端正式版

这是一个可部署到公网、可多电脑登录、数据实时保存在云端的外贸 CRM。

## 正式版包含
- 邮箱注册 / 登录
- Supabase 云数据库
- Row Level Security：每个账号只能看到自己的数据
- 今日工作台
- 客户池
- A/B/C 优先级
- 项目 / 报价 / 样品 / 等待回复 / 培育等销售状态
- 下次跟进 + 逾期任务
- 客户沟通时间线
- 记录 Email / WhatsApp / LinkedIn / 电话 / 报价 / 样品 / 物流等沟通
- Excel / CSV 批量导入客户
- JSON 备份
- 产品知识库
- 销售阶段智能建议
- Email / WhatsApp / LinkedIn / 电话脚本快速起草
- PWA 基础配置，手机浏览器也可使用

## 1. 创建 Supabase
1. 打开 Supabase，新建项目。
2. 进入 SQL Editor。
3. 复制 `supabase_schema.sql` 全部内容并运行。
4. 进入 Project Settings > API，复制：
   - Project URL
   - anon public key

## 2. 配置本项目
打开 `config.js`，替换：
- `PASTE_YOUR_SUPABASE_URL_HERE`
- `PASTE_YOUR_SUPABASE_ANON_KEY_HERE`

不要使用 service_role key。

## 3. 部署到公网
推荐任意一个静态托管平台：
- Vercel
- Netlify
- Cloudflare Pages
- GitHub Pages

直接上传整个文件夹即可。部署后会得到一个 HTTPS 网址。

以后：
公司电脑 -> 打开网址 -> 登录
家里电脑 -> 打开同一网址 -> 登录
手机 -> 打开同一网址 -> 登录
看到的是同一套云端客户数据。

## 4. Supabase Auth 建议
Authentication > Providers > Email：
- 正式使用建议保留邮箱验证
- 如果只是自己测试，可暂时关闭 Confirm email

Authentication > URL Configuration：
把部署后的 HTTPS 网址加入 Site URL / Redirect URLs。

## 5. Excel 导入列名
系统支持中英文常见列名。推荐：
公司 | 联系人 | 国家 | 职位 | 来源 | 产品 | 状态 | 优先级 | 最后联系 | 下次跟进 | 卡点 | 备注 | 标签

## 数据安全
数据库启用 RLS。浏览器中只使用 Supabase anon key。
严禁把 service_role key 放到 `config.js`。

## 下一阶段
如果继续升级，可增加：
- Gmail 自动同步
- AI 真正读取客户历史后生成回复
- 报价 / PI / 样品 / 物流模块
- 邮件模板库
- 客户多联系人地图
- 每日 30 客户执行队列
- 销售漏斗与业绩看板
