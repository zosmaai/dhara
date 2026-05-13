/// Dhara Extension SDK for Rust.
///
/// Build extensions that communicate with the Dhara agent via
/// JSON-RPC 2.0 over stdin/stdout.

pub mod protocol;
pub mod extension;
pub mod types;

pub use extension::Extension;
pub use types::*;
