import { GoogleAuth } from "google-auth-library";

const auth = new GoogleAuth({
  keyFile: "./keys/service-account.json", // path to JSON
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

export async function getAccessToken() {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}
