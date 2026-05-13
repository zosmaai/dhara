# typed: false
# frozen_string_literal: true

# Dhara — The Agent Protocol Standard
# Homebrew formula for the zosmaai/homebrew-tap tap.
#
# Install:
#   brew tap zosmaai/homebrew-tap
#   brew install dhara

class Dhara < Formula
  desc "Minimal, secure, language-agnostic AI coding agent harness"
  homepage "https://github.com/zosmaai/dhara"
  license "MIT"
  head "https://github.com/zosmaai/dhara.git", branch: "main"

  depends_on "node@22"

  def install
    system "npm", "install", "--ignore-scripts"
    system "npx", "tsc"
    libexec.install Dir["*"]
    bin.install_symlink libexec/"dist/cli/main.js" => "dhara"
  end

  test do
    assert_match "dhara", shell_output("#{bin}/dhara --version")
  end
end
