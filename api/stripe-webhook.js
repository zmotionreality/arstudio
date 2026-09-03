// Keeps each client's subscription_status in sync with what actually
// happens in Stripe (payment succeeded, payment failed, canceled), so
// the dashboard badge is always accurate without you checking manually.
//
// Setup, after this is deployed:
//   1. Stripe Dashboard -> Developers -> Webhooks -> Add endpoint
//        URL: https://your-app.vercel.app/api/stripe-webhook
//        Events to send: checkout.session.completed,
//                         invoice.payment_failed,
//                         customer.subscription.deleted
//   2. Copy the "Signing secret" Stripe shows you, add it in Vercel as:
//        STRIPE_WEBHOOK_SECRET = whsec_...

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

module.exports.config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const sig = req.headers["stripe-signature"];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    res.status(400).send(`Webhook signature error: ${err.message}`);
    return;
  }

  const setStatus = (clientId, status) =>
    supabase.from("clients").update({ subscription_status: status }).eq("id", clientId);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.metadata?.clientId) {
        await setStatus(session.metadata.clientId, "active");
        await supabase.from("clients")
          .update({ stripe_subscription_id: session.subscription })
          .eq("id", session.metadata.clientId);
      }
      break;
    }
    case "invoice.payment_failed": {
      const { data: client } = await supabase
        .from("clients").select("id").eq("stripe_customer_id", event.data.object.customer).single();
      if (client) await setStatus(client.id, "past_due");
      break;
    }
    case "customer.subscription.deleted": {
      const { data: client } = await supabase
        .from("clients").select("id").eq("stripe_customer_id", event.data.object.customer).single();
      if (client) await setStatus(client.id, "canceled");
      break;
    }
  }

  res.status(200).json({ received: true });
};
