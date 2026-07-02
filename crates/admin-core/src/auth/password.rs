use argon2::{
    password_hash::{
        PasswordHash as ArgonPasswordHash, PasswordHasher as _, PasswordVerifier as _, SaltString,
    },
    Argon2,
};
use rand_core::OsRng;

use crate::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PasswordHash(String);

impl PasswordHash {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn is_legacy_md5(&self) -> bool {
        self.0.len() == 32 && self.0.chars().all(|ch| ch.is_ascii_hexdigit())
    }

    pub fn is_argon2(&self) -> bool {
        self.0.starts_with("$argon2")
    }

    pub fn replace(&mut self, value: impl Into<String>) {
        self.0 = value.into();
    }
}

pub trait PasswordVerifier: Send + Sync {
    fn verify(&self, password: &str, hash: &PasswordHash) -> bool;
}

pub trait PasswordHasher: Send + Sync {
    fn hash_password(&self, password: &str) -> AppResult<PasswordHash>;
}

#[derive(Debug, Clone, Default)]
pub struct LegacyMd5PasswordVerifier;

impl PasswordVerifier for LegacyMd5PasswordVerifier {
    fn verify(&self, password: &str, hash: &PasswordHash) -> bool {
        hash.is_legacy_md5()
            && legacy_md5_hex(password.as_bytes()) == hash.as_str().to_ascii_lowercase()
    }
}

#[derive(Debug, Clone, Default)]
pub struct Argon2PasswordHasher;

impl PasswordHasher for Argon2PasswordHasher {
    fn hash_password(&self, password: &str) -> AppResult<PasswordHash> {
        let salt = SaltString::generate(&mut OsRng);
        let hash = Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map_err(|error| AppError::Database(format!("密码哈希失败: {error}")))?
            .to_string();
        Ok(PasswordHash::new(hash))
    }
}

#[derive(Debug, Clone, Default)]
pub struct CompatPasswordVerifier;

impl PasswordVerifier for CompatPasswordVerifier {
    fn verify(&self, password: &str, hash: &PasswordHash) -> bool {
        if hash.is_legacy_md5() {
            return LegacyMd5PasswordVerifier.verify(password, hash);
        }

        let Ok(parsed) = ArgonPasswordHash::new(hash.as_str()) else {
            return false;
        };

        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok()
    }
}

pub fn legacy_md5_hex(input: &[u8]) -> String {
    const S: [u32; 64] = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5,
        9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10,
        15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ];
    const K: [u32; 64] = [
        0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613,
        0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193,
        0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d,
        0x02441453, 0xd8a1e681, 0xe7d3fbc8, 0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
        0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122,
        0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
        0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665, 0xf4292244,
        0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
        0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb,
        0xeb86d391,
    ];

    let bit_len = (input.len() as u64) * 8;
    let mut message = input.to_vec();
    message.push(0x80);
    while message.len() % 64 != 56 {
        message.push(0);
    }
    message.extend_from_slice(&bit_len.to_le_bytes());

    let mut a0 = 0x6745_2301_u32;
    let mut b0 = 0xefcd_ab89_u32;
    let mut c0 = 0x98ba_dcfe_u32;
    let mut d0 = 0x1032_5476_u32;

    for chunk in message.chunks_exact(64) {
        let mut m = [0_u32; 16];
        for (index, word) in m.iter_mut().enumerate() {
            let start = index * 4;
            *word = u32::from_le_bytes([
                chunk[start],
                chunk[start + 1],
                chunk[start + 2],
                chunk[start + 3],
            ]);
        }

        let mut a = a0;
        let mut b = b0;
        let mut c = c0;
        let mut d = d0;

        for i in 0..64 {
            let (f, g) = match i {
                0..=15 => ((b & c) | ((!b) & d), i),
                16..=31 => ((d & b) | ((!d) & c), (5 * i + 1) % 16),
                32..=47 => (b ^ c ^ d, (3 * i + 5) % 16),
                _ => (c ^ (b | (!d)), (7 * i) % 16),
            };

            let next_d = c;
            c = b;
            b = b.wrapping_add(
                a.wrapping_add(f)
                    .wrapping_add(K[i])
                    .wrapping_add(m[g])
                    .rotate_left(S[i]),
            );
            a = d;
            d = next_d;
        }

        a0 = a0.wrapping_add(a);
        b0 = b0.wrapping_add(b);
        c0 = c0.wrapping_add(c);
        d0 = d0.wrapping_add(d);
    }

    [a0, b0, c0, d0]
        .into_iter()
        .flat_map(u32::to_le_bytes)
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{
        legacy_md5_hex, Argon2PasswordHasher, CompatPasswordVerifier, LegacyMd5PasswordVerifier,
        PasswordHash, PasswordHasher, PasswordVerifier,
    };

    #[test]
    fn legacy_md5_matches_old_node_hash() {
        assert_eq!(
            legacy_md5_hex(b"password"),
            "5f4dcc3b5aa765d61d8327deb882cf99"
        );
    }

    #[test]
    fn legacy_verifier_accepts_matching_password() {
        let verifier = LegacyMd5PasswordVerifier;
        let hash = PasswordHash::new("5f4dcc3b5aa765d61d8327deb882cf99");

        assert!(verifier.verify("password", &hash));
        assert!(!verifier.verify("wrong", &hash));
    }

    #[test]
    fn argon2_hasher_emits_phc_hash() {
        let hasher = Argon2PasswordHasher;
        let hash = hasher
            .hash_password("secret")
            .expect("argon2 hash should be generated");

        assert!(hash.is_argon2());
        assert!(!hash.is_legacy_md5());
        assert!(hash.as_str().len() > 32);
    }

    #[test]
    fn compat_verifier_accepts_argon2_and_legacy_md5() {
        let hasher = Argon2PasswordHasher;
        let verifier = CompatPasswordVerifier;
        let argon_hash = hasher
            .hash_password("secret")
            .expect("argon2 hash should be generated");
        let legacy_hash = PasswordHash::new(legacy_md5_hex(b"secret"));

        assert!(verifier.verify("secret", &argon_hash));
        assert!(verifier.verify("secret", &legacy_hash));
        assert!(!verifier.verify("wrong", &argon_hash));
        assert!(!verifier.verify("wrong", &legacy_hash));
    }
}
