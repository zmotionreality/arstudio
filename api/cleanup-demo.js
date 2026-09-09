// Best-effort garbage collection for "Try It Yourself" demo records.
// Called from the browser right before a new demo is created (see the
// landing page's try-it script) instead of running on a schedule — this
// project's Vercel plan only allows once-a-day cron jobs, and demo traffic
// is low enough that piggybacking cleanup on each new attempt keeps things
// tidy without needing a cron job or any extra secret.
//
// Uses the same public Supabase URL/anon key already embedded in the
// front-end (js/supabase-client.js) — safe to have here too — plus the
// same R2 credentials already configured for get-upload-url.js.

const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://ucpnbsftxocrwksfvtvc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_q2XnhHq_3gFJs0f3K8nVGA_noxKD7R7";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const nowIso = new Date().toISOString();

    const { data: expired, error } = await supabase
      .from("demo_items")
      .select("*")
      .lt("expires_at", nowIso);
    if (error) throw error;

    if (expired && expired.length) {
      const s3 = new S3Client({
        region: "auto",
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
      });

      const keyFromUrl = (url) => url.replace(`${process.env.R2_PUBLIC_URL}/`, "");

      await Promise.all(
        expired.flatMap((row) =>
          [row.photo_url, row.video_url, row.mind_url].map(async (url) => {
            if (!url) return;
            try {
              await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: keyFromUrl(url) }));
            } catch (e) {
              // Best-effort cleanup — one stale object left behind is not
              // worth failing the whole request over.
            }
          })
        )
      );

      await supabase.from("demo_items").delete().lt("expires_at", nowIso);
    }

    res.status(200).json({ cleaned: expired ? expired.length : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
