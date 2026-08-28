import Foundation
import Security
import Darwin

// Developer-only setup helper. Read the token from stdin so it is never a
// command-line argument, environment variable, report value, or file.
let service = "chicken-line-production-workers-ai"
let account = "default"
let input = FileHandle.standardInput.readDataToEndOfFile()

guard var token = String(data: input, encoding: .utf8) else {
    fputs("KEYCHAIN_STORE_INVALID_INPUT\n", stderr)
    exit(2)
}

while token.last == "\n" || token.last == "\r" {
    token.removeLast()
}

guard !token.isEmpty && !token.contains(where: { $0.isWhitespace }) else {
    fputs("KEYCHAIN_STORE_INVALID_INPUT\n", stderr)
    exit(2)
}

let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service,
    kSecAttrAccount as String: account,
]
let passwordData = Data(token.utf8)
let update: [String: Any] = [
    kSecValueData as String: passwordData,
    kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
]

var status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
if status == errSecItemNotFound {
    var item = query
    item[kSecValueData as String] = passwordData
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    status = SecItemAdd(item as CFDictionary, nil)
}

token.removeAll(keepingCapacity: false)
guard status == errSecSuccess else {
    fputs("KEYCHAIN_STORE_FAILED\n", stderr)
    exit(1)
}

print("KEYCHAIN_STORE=PASS")
