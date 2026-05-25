package com.tvbox.web.config;

import com.fasterxml.jackson.core.StreamReadConstraints;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class JacksonConfig {

    private static final int MAX_STRING_LEN = 5_000_000;
    private static final int MAX_NUM_LEN = 2_000;
    private static final int MAX_NESTING = 400;
    private static final long MAX_DOC_LEN = 50_000_000L;

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer streamConstraintsCustomizer() {
        return builder -> {
            StreamReadConstraints constraints = StreamReadConstraints.builder()
                    .maxStringLength(MAX_STRING_LEN)
                    .maxNumberLength(MAX_NUM_LEN)
                    .maxNestingDepth(MAX_NESTING)
                    .maxDocumentLength(MAX_DOC_LEN)
                    .build();
            builder.postConfigurer((ObjectMapper mapper) -> {
                mapper.getFactory().setStreamReadConstraints(constraints);
            });
        };
    }
}
