import * as ipaddr from 'ipaddr.js'

/**
 * 检查 IP 地址是否在指定的 CIDR 范围内
 */
export function isIpInCIDR(ip: string, cidr: string): boolean {
  try {
    // 解析并处理 IP 地址（自动处理 IPv4-mapped IPv6 地址）
    const addr = ipaddr.process(ip)
    // 解析 CIDR
    const [range, bits] = ipaddr.parseCIDR(cidr)

    // 检查 IP 类型是否匹配
    if (addr.kind() !== range.kind()) {
      return false
    }

    return addr.match(range, bits)
  } catch {
    return false
  }
}

/**
 * 检查 IP 地址是否在白名单中的任意 CIDR 范围内
 */
export function isIpInWhitelist(ip: string, whitelist: string[]): boolean {
  return whitelist.some((cidr) => isIpInCIDR(ip, cidr))
}

/**
 * 验证 CIDR 格式是否有效
 */
export function isValidCIDR(cidr: string): boolean {
  return ipaddr.isValidCIDR(cidr)
}
