# Integraatiot

```mermaid
flowchart LR
    subgraph OPH Järestelmät
        Koski
        Oppijanumerorekisteri
    end
    subgraph OPH Liityntäpalvelin
        X-Road&nbspClient&nbspProxy
        X-Road&nbspServer&nbspProxy
    end
    subgraph Ulkoiset palvelut
        HSL
        VTJ
        Suomi.fi
    end
    Oppijanumerorekisteri --> X-Road&nbspClient&nbspProxy
    X-Road&nbspServer&nbspProxy --> Koski
    Suomi.fi --> X-Road&nbspServer&nbspProxy
    HSL --> X-Road&nbspServer&nbspProxy
    X-Road&nbspClient&nbspProxy --> VTJ
```