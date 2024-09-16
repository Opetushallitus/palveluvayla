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
import java.time.Duration;
import java.util.Map;

import static io.gatling.javaapi.core.CoreDsl.*;
import static io.gatling.javaapi.http.HttpDsl.*;

public class PingSimulation extends Simulation {
    HttpProtocolBuilder httpProtocol = http
            .baseUrl("https://proxy.dev.palveluvayla.opintopolku.fi")
            .header("Content-Type", "text/xml;charset=UTF-8");

    String soapRequest = """
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:xro="http://x-road.eu/xsd/xroad.xsd"
                  xmlns:id="http://x-road.eu/xsd/identifiers"
                  xmlns:prod="http://docs.koski-xroad.fi/producer">
   <soapenv:Header>
      <xro:protocolVersion>4.0</xro:protocolVersion>
      <xro:id>ID123456</xro:id>
      <xro:userId>123456789</xro:userId>
      <xro:service id:objectType="SERVICE">
         <id:xRoadInstance>FI-DEV</id:xRoadInstance>
         <id:memberClass>GOV</id:memberClass>
         <id:memberCode>2769790-1</id:memberCode>
         <id:subsystemCode>test-service</id:subsystemCode>
         <id:serviceCode>ping</id:serviceCode>
         <id:serviceVersion>v1</id:serviceVersion>
      </xro:service>
      <xro:client id:objectType="SUBSYSTEM">
         <id:xRoadInstance>FI-DEV</id:xRoadInstance>
         <id:memberClass>GOV</id:memberClass>
         <id:memberCode>2769790-1</id:memberCode>
         <id:subsystemCode>test-client</id:subsystemCode>
      </xro:client>
   </soapenv:Header>
   <soapenv:Body>
      <prod:ping/>
   </soapenv:Body>
</soapenv:Envelope>
    """;

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