import ipaddr from 'ipaddr.js'

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

export function isIpInWhitelist(ip: string, whitelist: string[]): boolean {
  return whitelist.some((cidr) => isIpInCIDR(ip, cidr))
}
