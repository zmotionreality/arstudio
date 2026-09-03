// Vercel serverless function. Runs on Vercel's servers, never in the browser,
// so this is the only safe place to use your Stripe SECRET key.
//
// Setup:
//   1. In Vercel: Project Settings -> Environment Variables, add:
//        STRIPE_SECRET_KEY   = sk_live_... (or sk_test_... while testing)
//        SUPABASE_URL        = your Supabase project URL
//        SUPABASE_SERVICE_ROLE_KEY = the service_role key (Project Settings -> API)
//                                    NOT the anon key — this one is secret.
//        SITE_URL            = https://your-app.vercel.app
//   2. `npm install stripe @supabase/supabase-js` in this project before deploying
//      (see package.json).

const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { clientId, monthlyFee, clientName } = req.body;
    if (!clientId || !monthlyFee) {
      res.status(400).json({ error: "Missing clientId or monthlyFee." });
      return;
    }

    const { data: client } = await supabase.from("clients").select("*").eq("id", clientId).single();

    let customerId = client?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ name: clientName });
      customerId = customer.id;
      await supabase.from("clients").update({ stripe_customer_id: customerId }).eq("id", clientId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: `${clientName} — AR service` },
          unit_amount: Math.round(Number(monthlyFee) * 100),
          recurring: { interval: "month" },
        },
        quantity: 1,
      }],
      success_url: `${process.env.SITE_URL}/admin/client.html?id=${clientId}&payment=success`,
      cancel_url: `${process.env.SITE_URL}/admin/client.html?id=${clientId}&payment=canceled`,
      metadata: { clientId },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
