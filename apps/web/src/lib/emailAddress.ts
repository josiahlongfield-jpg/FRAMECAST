/** A plain email address: no quotes, spaces, commas or look-alike characters. */
export function plainEmail(input: string) {
  const email = input.trim().toLowerCase();
  return email.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email) ? email : null;
}

/** The inbox an address delivers to: name+tag@ and, for Gmail, dots don't make a different one. */
export function mailbox(email: string) {
  const [local, domain] = email.split("@");
  const gmail = domain === "gmail.com" || domain === "googlemail.com";
  const name = local.split("+")[0];
  return `${gmail ? name.replace(/\./g, "") : name}@${gmail ? "gmail.com" : domain}`;
}
