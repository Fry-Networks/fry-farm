const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  region: process.env.AWS_REGION, // credentials come from env vars
});

async function uploadToS3({ bucket, key, buffer, contentType }) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // If you want public objects, configure a bucket policy or set ACL here.
      // ACL: "public-read",
    })
  );

  // Public URL if bucket is public. Otherwise use signed URLs.
  const region = process.env.AWS_REGION;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodeURIComponent(key)}`;
}

module.exports = { uploadToS3 };