export const getBrowser = (ua: string) => {
  if (/chrome|crios|crmo/i.test(ua)) return "Chrome";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua) && !/chrome|crios|crmo/i.test(ua)) return "Safari";
  if (/msie|trident/i.test(ua)) return "Internet Explorer";
  if (/edg/i.test(ua)) return "Edge";
  if (/opera|opr/i.test(ua)) return "Opera";
  return "Unknown";
};

export const parseUserAgent = (ua: string) => {
  let os = "Unknown";
  let device = "Desktop";

  if (/windows nt/i.test(ua)) os = "Windows";
  else if (/macintosh|mac os x/i.test(ua)) os = "Mac OS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/linux/i.test(ua)) os = "Linux";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";

  if (/mobile/i.test(ua)) device = "Mobile";
  else if (/tablet/i.test(ua)) device = "Tablet";

  return `${getBrowser(ua)} on ${device} running ${os}`;
};
