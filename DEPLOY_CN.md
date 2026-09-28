# 部署最短路径

## Vercel
1. 新建 Project。
2. 上传本项目文件夹，或连接 GitHub 仓库。
3. Framework Preset 选 Other。
4. Build Command 留空。
5. Output Directory 留空。
6. Deploy。
7. 把得到的网址加入 Supabase Authentication > URL Configuration。

## Netlify
1. Add new site > Deploy manually。
2. 将整个项目文件夹拖入。
3. 得到 HTTPS 地址。
4. 把该地址加入 Supabase Authentication > URL Configuration。

## GitHub Pages
1. 新建一个仓库。
2. 上传全部文件到仓库根目录。
3. Settings > Pages > Deploy from branch。
4. 选择 main / root。
5. 保存后会得到一个 HTTPS 地址。
