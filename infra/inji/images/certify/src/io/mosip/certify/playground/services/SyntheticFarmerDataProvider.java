package io.mosip.certify.playground.services;

import java.util.Map;
import javax.sql.DataSource;
import io.mosip.certify.api.exception.DataProviderExchangeException;
import io.mosip.certify.api.spi.DataProviderPlugin;
import io.mosip.certify.playground.models.SyntheticFarmerDao;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

// Certify data provider for local development. Certify selects it when
// mosip.certify.integration.data-provider-plugin is
// PlaygroundSyntheticFarmerProvider, which AssetRenderer sets only when
// INJI_LOCAL_DEVELOPMENT is true. Every Farmer credential format is served from
// the same record.
@Component
@ConditionalOnProperty(name = "mosip.certify.integration.data-provider-plugin", havingValue = "PlaygroundSyntheticFarmerProvider")
public final class SyntheticFarmerDataProvider implements DataProviderPlugin {
    private static final Logger LOG = LoggerFactory.getLogger(SyntheticFarmerDataProvider.class);
    private final SyntheticFarmerDao records;
    private final SyntheticFarmerFactory factory;

    public SyntheticFarmerDataProvider(DataSource source) {
        records = new SyntheticFarmerDao(source);
        factory = new SyntheticFarmerFactory();
    }

    // Returns the subject's record, creating it on first issuance. The length
    // limit matches the subject_id column. Registry errors are logged by type
    // only and reported to Certify without detail.
    @Override
    public JSONObject fetchData(Map<String, Object> identity) throws DataProviderExchangeException {
        // Certify supplies the subject from its validated authorization token, never a form field.
        Object value = identity.get("sub");
        if (!(value instanceof String subject) || subject.isBlank() || subject.length() > 255)
            throw new DataProviderExchangeException("Missing authenticated subject for synthetic issuer record");
        try {
            return records.findOrCreate(subject, factory.create(subject));
        } catch (RuntimeException error) {
            LOG.error("Synthetic issuer registry unavailable ({})", error.getClass().getSimpleName());
            throw new DataProviderExchangeException("Synthetic issuer registry unavailable");
        }
    }
}
