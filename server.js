require("dotenv").config();
const express = require("express");
const crypto = require("crypto");

const app = express();

app.post(
  "/shopify-order",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const hmac = req.headers["x-shopify-hmac-sha256"];

      const digest = crypto
        .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
        .update(req.body)
        .digest("base64");

      const valid =
        hmac &&
        crypto.timingSafeEqual(
          Buffer.from(hmac),
          Buffer.from(digest)
        );

      if (!valid) return res.sendStatus(401);

      const order = JSON.parse(req.body.toString());

      const response = await fetch(
        `https://bzr.openai.com/v1/events?pid=${process.env.PIXEL_ID}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            events: [{
              id: `order_${order.id}`,
              type: "order_created",
              timestamp_ms: Date.now(),
              action_source: "web",
              source_url: order.order_status_url || order.checkout_id
                ? `https://${order.domain || "nuviekids.com"}/`
                : `https://${order.domain || "nuviekids.com"}/`,
              data: {
                type: "contents",
                amount: Math.round(Number(order.current_total_price || order.total_price) * 100),
                currency: order.currency
              }
            }]
          })
        }
      );

      if (!response.ok) {
        return res.status(502).send(await response.text());
      }

      res.send("Purchase event sent");
    } catch (error) {
      res.sendStatus(500);
    }
  }
);

app.listen(process.env.PORT || 3000, () => {
  console.log("Purchase tracking server running");
});
