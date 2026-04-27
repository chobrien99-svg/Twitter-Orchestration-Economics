import { TwitterApi, TwitterApiReadWrite } from "twitter-api-v2";
import { env } from "./env";

let cached: TwitterApiReadWrite | null = null;

/**
 * Returns a user-context X client with read+write scope.
 * User-context auth (consumer key/secret + access token/secret) is required
 * to create posts on behalf of the authenticated account.
 */
export function getXClient(): TwitterApiReadWrite {
  if (cached) return cached;
  const client = new TwitterApi({
    appKey: env.x.apiKey(),
    appSecret: env.x.apiKeySecret(),
    accessToken: env.x.accessToken(),
    accessSecret: env.x.accessTokenSecret(),
  });
  cached = client.readWrite;
  return cached;
}

const URL_PATTERN = /\bhttps?:\/\/\S+/i;

export function postContainsUrl(body: string): boolean {
  return URL_PATTERN.test(body);
}

/**
 * Returns the X Usage plan operation name for a text post, used to look up
 * cost in the cost_estimates table.
 */
export function postOperationName(body: string): "create_post" | "create_post_with_url" {
  return postContainsUrl(body) ? "create_post_with_url" : "create_post";
}
