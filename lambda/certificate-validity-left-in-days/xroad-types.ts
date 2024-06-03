export type Token = {
  id: string
  name: string
  type: TokenType
  keys: Key[]
  status: TokenStatus
  logged_in: boolean
  available: boolean
  saved_to_configuration: boolean
  read_only: boolean
  serial_number: string
  token_infos: KeyValuePair[]
  possilbe_actions: PossibleAction[]
}

export type TokenType = "SOFTWARE" | "HARDWARE"

export type KeyValuePair = {
  key: string
  value: string
}

export type TokenStatus = "OK" | "USER_PIN_LOCKED" | "USER_PIN_INCORRECT" | "USER_PIN_INVALID" | "USER_PIN_EXPIRED" | "USER_PIN_COUNT_LOW" | "USER_PIN_FINAL_TRY" | "NOT_INITIALIZED"

export type Key = {
  id: string
  name: string
  label: string
  certificates: TokenCertificate[]
  certificate_signing_requests: unknown[]
  usage: "AUTHENTICATION" | "SIGNING"
  available: boolean
  saved_to_configuration: boolean
  possible_actions: PossibleAction[]
}

export type PossibleAction = "DELETE" | "ACTIVATE" | "DISABLE" | "LOGIN" | "LOGOUT" | "REGISTER" | "UNREGISTER" | "IMPORT_FROM_TOKEN" | "GENERATE_KEY" | "EDIT_FRIENDLY_NAME" | "GENERATE_AUTH_CSR" | "GENERATE_SIGN_CSR" | "TOKEN_CHANGE_PIN"

export type TokenCertificate = {
  ocsp_status: CertificateOcspStatus
  owner_id: string
  available: boolean
  saved_to_configuration: boolean
  certificate_details: CertificateDetails
  status: CertificateStatus
  possible_actions: PossibleAction[]
}

export type CertificateDetails = {
  issuer_distinguished_name: string
  issuer_common_name: string
  subject_distinguished_name: string
  subject_common_name: string
  not_before: string
  not_after: string
  serial: string
  version: number
  signature_algorithm: string
  signature: string
  public_key_algorithm: string
  rsa_public_key_modulus: string
  rsa_public_key_exponent: string
  hash: string
  key_usages: KeyUsage[]
  subject_alternative_names: string
}

export type KeyUsage = "DIGITAL_SIGNATURE" | "NON_REPUDIATION" | "KEY_ENCIPHERMENT" | "DATA_ENCIPHERMENT" | "KEY_AGREEMENT" | "KEY_CERT_SIGN" | "CRL_SIGN" | "ENCIPHER_ONLY" | "DECIPHER_ONLY"

export type CertificateStatus = "SAVED" | "REGISTRATION_IN_PROGRESS" | "REGISTERED" | "DELETION_IN_PROGRESS" | "GLOBAL_ERROR"

export type CertificateOcspStatus = "DISABLED" | "EXPIRED" | "OCSP_RESPONSE_UNKNOWN" | "OCSP_RESPONSE_GOOD" | "OCSP_RESPONSE_SUSPENDED" | "OCSP_RESPONSE_REVOKED"
