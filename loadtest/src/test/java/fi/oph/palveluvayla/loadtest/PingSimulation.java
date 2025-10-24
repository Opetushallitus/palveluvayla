package fi.oph.palveluvayla.loadtest;


import io.gatling.http.client.Request;
import io.gatling.javaapi.core.*;
import io.gatling.javaapi.http.*;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.signer.Aws4Signer;
import software.amazon.awssdk.auth.signer.params.Aws4SignerParams;
import software.amazon.awssdk.http.SdkHttpFullRequest;
import software.amazon.awssdk.http.SdkHttpMethod;
import software.amazon.awssdk.regions.Region;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.time.Duration;
import java.util.Map;
import java.util.stream.Collectors;

import static io.gatling.javaapi.core.CoreDsl.*;
import static io.gatling.javaapi.http.HttpDsl.*;

public class PingSimulation extends Simulation {
    HttpProtocolBuilder httpProtocol = http
            .baseUrl("https://proxy.dev.palveluvayla.opintopolku.fi")
            .header("Content-Type", "text/xml;charset=UTF-8");
    InputStream is = PingSimulation.class.getResourceAsStream("/devsoap.xml");
    String soapRequest = new BufferedReader(new InputStreamReader(is)).lines().parallel().collect(Collectors.joining("\n"));

    ScenarioBuilder scn = scenario("Ping SOAP Test")
            .exec(
                    http("Ping SOAP Request")
                            .post("/test-client")
                            .body(StringBody(soapRequest))
                            .sign(PingSimulation::withAWSv4)
                            .check(
                                    status().is(200),
                                    xpath("//tns:pingResponse", Map.of("tns", "http://example.com/pingpong")).exists()))
            .pause(1);
    {
        setUp(
                scn.injectOpen(
                        rampUsersPerSec(1).to(30).during(Duration.ofMinutes(5)),
                        constantUsersPerSec(30).during(Duration.ofMinutes(5)),
                        rampUsersPerSec(30).to(60).during(Duration.ofMinutes(5)),
                        constantUsersPerSec(60).during(Duration.ofMinutes(5))

                )
        ).protocols(httpProtocol);
    }

    private static Request withAWSv4(Request request) {
        try {
            Aws4Signer signer = Aws4Signer.create();

            SdkHttpFullRequest unsignedRequest = SdkHttpFullRequest.builder()
                    .method(SdkHttpMethod.POST)
                    .uri(request.getUri().toJavaNetURI())
                    .putHeader("Content-Type", "text/xml;charset=UTF-8")
                    .contentStreamProvider(() -> new java.io.ByteArrayInputStream(request.getBody().getBytes()))
                    .build();

            DefaultCredentialsProvider credentialsProvider = DefaultCredentialsProvider.create();

            Aws4SignerParams signerParams = Aws4SignerParams.builder()
                    .signingRegion(Region.EU_WEST_1)
                    .awsCredentials(credentialsProvider.resolveCredentials())
                    .signingName("execute-api")
                    .build();

            SdkHttpFullRequest signedRequest = signer.sign(unsignedRequest, signerParams);
            signedRequest.headers().entrySet().forEach(entry -> request.getHeaders().add(entry.getKey(), entry.getValue()));

            return request;
        } catch (Exception e) {
            throw new RuntimeException("Error signing request", e);
        }
    }
}