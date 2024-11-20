# Integraatiot

```mermaid


flowchart LR
    subgraph OPH Järestelmät
        Koski
        Oppijanumerorekisteri
    end
    subgraph OPH Liityntäpalvelin
        xroad_client_proxy[X-Road Client Proxy]
        xroad_server_proxy[X-Road Server Proxy]
    end
    subgraph Ulkoiset palvelut
        HSL
        VTJ
        Suomi.fi
    end
    Oppijanumerorekisteri --> xroad_client_proxy
    xroad_server_proxy --> Koski
    Suomi.fi --> xroad_server_proxy
    HSL --> xroad_server_proxy
    xroad_client_proxy --> VTJ
```