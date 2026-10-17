package io.mosip.mimoto.health;

import io.mosip.mimoto.service.EncryptionService;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

@Component("walletKey")
public final class WalletKeyHealthIndicator implements HealthIndicator {
    private final EncryptionService encryption;

    public WalletKeyHealthIndicator(EncryptionService encryption) {
        this.encryption = encryption;
    }

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
