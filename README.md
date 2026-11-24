# PhoneStock GitHub Pages 网页版

这个文件夹可以直接上传到 GitHub 仓库并通过 GitHub Pages 使用，不需要服务器或数据库。

## 发布到 GitHub Pages

1. 将本文件夹内的全部文件上传到仓库根目录。
2. 打开仓库的 **Settings → Pages**。
3. 在 **Build and deployment** 中选择 **Deploy from a branch**。
4. 选择 `main` 分支和 `/ (root)`，然后保存。
5. 等待 GitHub 生成 HTTPS 页面地址。

## 数据保存与设备共享

- 数据保存在当前设备、当前浏览器、当前网址的 IndexedDB 中，不会保存到 GitHub。
- 清除浏览器网站数据、换浏览器或更换 GitHub Pages 地址时，本地数据不会自动跟随。
- 建议每天使用“完整备份 JSON”保存备份。
- 网页版和桌面版使用相同的完整 JSON 结构，可通过“导出完整备份 JSON”与“导入数据”合并记录。
- 导入执行合并，不覆盖当前数据；IMEI 重复或内容冲突时会在导入结果中提示。
- 入库页的“经手人”为选填手动输入，填写后会保持不变；随后连续扫码的每台手机都会保存该经手人，并显示在历史、今日批次和 Excel 明细中。

## iPhone / iPad 安装

使用 Safari 打开 GitHub Pages 地址，点击“分享 → 添加到主屏幕”。首次完整打开后可离线启动。

蓝牙扫码器应使用 HID 键盘模式，并设置扫描后发送 Enter。软件内置英文虚拟键盘只会在需要手动输入的字段中显示，IMEI、UPC 等扫码字段不会弹出该键盘。
