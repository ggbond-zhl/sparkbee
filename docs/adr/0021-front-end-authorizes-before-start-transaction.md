# Front End Authorizes Before Start Transaction

运行调试台的“启动充电”操作先由前端调用 `/authorize`，仅当鉴权通过后再调用 `/start-transaction`。这样保留后端 `Authorize` 和 `StartTransaction` 两个独立调试接口，同时让人工点击启动充电时产生符合刷卡启动预期的 OCPP 报文顺序；代价是前端需要承担这一次用户工作流编排。
