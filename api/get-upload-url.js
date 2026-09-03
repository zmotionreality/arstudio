// Cloudflare R2 is S3-compatible, so we use the standard AWS SDK pointed at
// R2's endpoint. The SECRET key stays here, server-side, and never reaches
// the browser. The browser only ever receives a short-lived "presigned URL"
// that's valid for uploading exactly one file.
//
// Setup, in Vercel -> Project Settings -> Environment Variables:
//   R2_ACCOUNT_ID        = 847b5b3886edd1838e46614f46bfc708   (yours)
//   R2_ACCESS_KEY_ID      = (yours)
//   R2_SECRET_ACCESS_KEY  = (yours)
//   R2_BUCKET_NAME        = zmotion
//   R2_PUBLIC_URL         = https://pub-2ae26cd4c09d45f986aaf4c82369945f.r2.dev
//
// After adding these, do `npm install` locally once (or let Vercel install
// them on deploy) so @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner
// are available.

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { fileName, contentType } = req.body;
    if (!fileName || !contentType) {
      res.status(400).json({ error: "Missing fileName or contentType." });
      return;
    }

    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });

    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fileName}`;

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 300 } // this link only works for 5 minutes
    );

    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    res.status(200).json({ uploadUrl, publicUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
