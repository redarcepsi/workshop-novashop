/**
 * UUID v4 aléatoire. crypto.randomUUID() n'existe que dans un contexte sécurisé (HTTPS ou localhost) : le site
 * servi en http://<adresse-de-la-VM>:8080 n'y a pas droit, alors que crypto.getRandomValues() marche partout.
 */
export function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
