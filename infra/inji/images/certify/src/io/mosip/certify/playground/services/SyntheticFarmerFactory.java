package io.mosip.certify.playground.services;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.json.JSONObject;

public final class SyntheticFarmerFactory {
    public JSONObject create(String subject) {
        String identifier = UUID.nameUUIDFromBytes(subject.getBytes(StandardCharsets.UTF_8)).toString();
        return new JSONObject()
                .put("id", subject)
                .put("fullName", "Synthetic Demo Farmer " + identifier.substring(0, 8))
                .put("mobileNumber", "0000000000")
                .put("dateOfBirth", "01-01-1990")
                .put("gender", "Not specified")
                .put("state", "Demo State")
                .put("district", "Demo District")
                .put("villageOrTown", "Synthetic Village")
                .put("postalCode", "000000")
                .put("landArea", "1 hectare (synthetic)")
                .put("landOwnershipType", "Demo only")
                .put("primaryCropType", "Maize")
                .put("secondaryCropType", "Rice")
                .put("face", "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAFCAYAAABW1IzHAAAAHklEQVQokWNgGPaAkZHxPyMj439sYrSQo51PBgsAALa0ECF30JSdAAAAAElFTkSuQmCC")
                .put("farmerID", "DEMO-" + identifier);
    }
}
