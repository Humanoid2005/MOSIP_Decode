package io.mosip.mimoto.health;

import io.mosip.mimoto.service.EncryptionService;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

// Mimoto health contributor "walletKey". The upstream HSM probe assumes a
// symmetric key stored in the HSM and is disabled locally (gap M9); this
// indicator checks the wallet's real encryption service instead.
@Component("walletKey")
public final class WalletKeyHealthIndicator implements HealthIndicator {
    private final EncryptionService encryption;

    public WalletKeyHealthIndicator(EncryptionService encryption) {
        this.encryption = encryption;
    }

    // UP only if a fixed value encrypts and decrypts back unchanged. Exception
    // details are kept out of the health response.
    @Override
    public Health health() {
        try {
            String plaintext = "inji-wallet-readiness";
            String decrypted = encryption.decrypt(encryption.encrypt(plaintext));
            return plaintext.equals(decrypted)
                    ? Health.up().build()
                    : Health.down().withDetail("error", "Wallet encryption round trip failed").build();
        } catch (Exception exception) {
            return Health.down().withDetail("error", "Wallet encryption keys unavailable").build();
        }
    }
}
