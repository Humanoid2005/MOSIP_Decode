package io.mosip.certify.playground.models;

import javax.sql.DataSource;
import org.json.JSONObject;
import org.springframework.jdbc.core.JdbcTemplate;

public final class SyntheticFarmerDao {
    private final JdbcTemplate database;

    public SyntheticFarmerDao(DataSource source) {
        database = new JdbcTemplate(source);
    }

    public JSONObject findOrCreate(String subject, JSONObject initialRecord) {
        database.update("INSERT INTO certify.playground_synthetic_farmer (subject_id, record) "
                + "VALUES (?, ?::jsonb) ON CONFLICT (subject_id) DO NOTHING", subject, initialRecord.toString());
        return new JSONObject(database.queryForObject(
                "SELECT record::text FROM certify.playground_synthetic_farmer WHERE subject_id = ?",
                String.class, subject));
    }
}
