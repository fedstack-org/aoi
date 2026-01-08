import { isIPv4, isIPv6 } from 'net'

/**
 * 将 IPv4 地址转换为 32 位整数
 */
function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

/**
 * 将 IPv6 地址转换为 BigInt
 */
function ipv6ToBigInt(ip: string): bigint {
  // 展开 :: 简写
  const parts = ip.split(':')
  const emptyIndex = parts.indexOf('')

  if (emptyIndex !== -1) {
    const missing = 8 - parts.filter((p) => p !== '').length
    const expanded = Array(missing).fill('0')
    parts.splice(emptyIndex, 1, ...expanded)
  }

  // 处理 IPv4-mapped IPv6 地址 (::ffff:192.168.1.1)
  const lastPart = parts[parts.length - 1]
  if (lastPart && lastPart.includes('.')) {
    const ipv4Parts = lastPart.split('.').map(Number)
    parts[parts.length - 1] = ((ipv4Parts[0] << 8) | ipv4Parts[1]).toString(16)
    parts.push(((ipv4Parts[2] << 8) | ipv4Parts[3]).toString(16))
  }

  let result = BigInt(0)
  for (const part of parts) {
    result = (result << BigInt(16)) | BigInt(parseInt(part || '0', 16))
  }
  return result
}

/**
 * 检查 IPv4 地址是否在指定的 CIDR 范围内
 */
function isIpv4InCIDR(ip: string, cidr: string): boolean {
  const [network, prefixStr] = cidr.split('/')
  const prefix = prefixStr ? parseInt(prefixStr, 10) : 32

  const ipInt = ipv4ToInt(ip)
  const networkInt = ipv4ToInt(network)
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0

  return (ipInt & mask) === (networkInt & mask)
}

/**
 * 检查 IPv6 地址是否在指定的 CIDR 范围内
 */
function isIpv6InCIDR(ip: string, cidr: string): boolean {
  const [network, prefixStr] = cidr.split('/')
  const prefix = prefixStr ? parseInt(prefixStr, 10) : 128

  const ipBigInt = ipv6ToBigInt(ip)
  const networkBigInt = ipv6ToBigInt(network)

  if (prefix === 0) {
    return true
  }

  const shift = BigInt(128 - prefix)
  return ipBigInt >> shift === networkBigInt >> shift
}

/**
 * 规范化 IP 地址（处理 IPv4-mapped IPv6 地址）
 */
function normalizeIp(ip: string): { ip: string; isV6: boolean } {
  // 处理 IPv4-mapped IPv6 地址 (::ffff:192.168.1.1)
  const ipv4MappedMatch = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (ipv4MappedMatch) {
    return { ip: ipv4MappedMatch[1], isV6: false }
  }

  if (isIPv4(ip)) {
    return { ip, isV6: false }
  }

  if (isIPv6(ip)) {
    return { ip, isV6: true }
  }

  // 无法识别的格式，返回原值
  return { ip, isV6: false }
}

/**
 * 检查 IP 地址是否在指定的 CIDR 范围内
 */
export function isIpInCIDR(ip: string, cidr: string): boolean {
  const normalized = normalizeIp(ip)
  const cidrIsV6 = cidr.includes(':')

  // IPv4 和 IPv6 不能混用
  if (normalized.isV6 !== cidrIsV6) {
    return false
  }

  if (normalized.isV6) {
    return isIpv6InCIDR(normalized.ip, cidr)
  } else {
    return isIpv4InCIDR(normalized.ip, cidr)
  }
}

/**
 * 检查 IP 地址是否在白名单中的任意 CIDR 范围内
 */
export function isIpInWhitelist(ip: string, whitelist: string[]): boolean {
  return whitelist.some((cidr) => isIpInCIDR(ip, cidr))
}
