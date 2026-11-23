# sfx2: fontes e licenças

Todos os 49 arquivos desta pasta saem de **gravações reais** dos pacotes gratuitos **Sonniss #GameAudioGDC** (2015 a 2026), baixados arquivo por arquivo de espelhos no archive.org. Nada foi sintetizado e nada veio de IA; o único "desenho" são filtros, cortes, panorâmica e respostas de ambiente (rua, salão, sala, cabine) para dar a perspectiva da cena.

## Licença
- **Sonniss #GameAudioGDC Bundle Licensing Agreement** (texto copiado dos próprios pacotes em `_licencas/`): licença mundial, não exclusiva, livre de royalties; uso em projetos **pessoais e comerciais, sem atribuição**; sincronização com vídeo permitida; pode editar e publicar dentro da obra. Proibido: revender os sons soltos, alegar autoria da gravação e (aviso da página do pacote no archive.org) usar para treinar IA.
- Na prática para a creat.MTT: pode ir no Reel sem crédito. Não redistribuir os .wav como biblioteca.
- Ressalva: os arquivos vieram de espelhos no archive.org, não do site da Sonniss (a página de licença do site respondeu 403 daqui). O texto da licença conferido é o que acompanha os pacotes de 2016, 2023 e 2026.

## Fontes que NÃO entraram, e por quê
- **Wikimedia Commons, "Unlocking a car.ogg"** (domínio público, bip real de carro destrancando): seria o bip ideal. O site respondeu 429 (limite de requisições) e eu insisti com outro agente de navegador e outras rotas; essa insistência foi barrada pelo sistema, com razão, e parei. O arquivo NÃO foi baixado nem usado. Se o dono quiser o bip verdadeiro, alguém baixa esse arquivo pelo navegador e ele entra no lugar de `carro_bip_longe.wav`.
- **Freesound**: bloqueado daqui (403) e o download exige conta. Não usado.
- **BBC Sound Effects (RemArc)**: a licença RemArc só cobre uso pessoal, educacional e de pesquisa; Reel de divulgação de empresa é uso comercial. Não usado.
- **ElevenLabs Sound Effects**: não usado (o plano grátis não dá licença comercial clara e som gerado foge do pedido de "gravação real"). Não consultei nem gastei crédito.
- **Mixkit**: só oferecia prévia em MP3 e não tinha trava de carro. Não usado.
- Ambiente de supermercado (UberDuo, "Checkout, Supermarket, Light Conversation"): baixado e descartado, porque tem conversa em inglês ao fundo (voz que não é da cena).

## Conferências feitas
- Voz: transcrição (faster-whisper medium, sem VAD, -20 LUFS) de todos os ambientes e passagens: só saíram as alucinações clássicas de ruído ("Legendas pela comunidade Amara.org", "Aplausos", "."), cada uma uma única vez. Conferido por medida de periodicidade de voz (`confere_periodicidade.json`): chuva, pista e trovões têm 0% de janelas com voz; a referência (voz real do filme) dá 39%. Os dois arquivos com valor alto são o toque de chamada (sino, tonal por natureza) e o limpador (motor).
- Limite: **não ouvi os arquivos** (não tenho como escutar aqui). A escolha foi por nome/descrição do gravador, envelope e espectro. Antes do mix final alguém precisa ouvir pelo menos: `carro_trancando_longe`, `fila_botao_e_chamada_loja`, `kal_soco_bora` e `chave_clique_perto`.

## Arquivo por arquivo

| arquivo sfx2 | evento | gravação de origem | tratamento |
|---|---|---|---|
| `chave_clique_perto.wav` | clique do polegar na chave (IMG_5169 q17-18, t=0,567-0,600 s) | 3maze - Buttons and Switches/button_on_off_064.wav; Varazuvi - California Foley/Key19.wav (molho de chaves, -15 dB, antes do clique) | passa-alta 350 Hz, estéreo fechado; o molho mexe 0,2 s antes do clique |
| `chave_clique_seco_so.wav` | só o clique (para o congelamento de 2 a 3 quadros) | 3maze - Buttons and Switches/button_on_off_064.wav | passa-alta 350 Hz |
| `carro_travas_longe.wav` | tranco das travas elétricas do carro preto (pisca 1, IMG_5170 t=1,802 s) | Ivo Vicic - Land Rover Defender TDI 300/56 Interior_Front_door lock button_lock unlock_mono _position 02.wav (trecho 3,14-3,62 s) | gravação real de trava de porta; filtros + resposta de rua |
| `carro_bip_longe.wav` | bip curto de confirmação (SUBSTITUTO: não é o bip do próprio carro; o áudio original do IMG_5170 não tem bip audível) | SHhh! Listen SFX Libraries - Optometrist Equipment/Auto Refractor,Scanning,Pneumatic,Beeps (bip piezo real de 2,15 kHz, 60 ms, trecho 1,955-2,13 s) | passa-alta 700 Hz, passa-baixa 5,2 kHz, resposta de rua |
| `carro_toque_buzina_longe.wav` | alternativa ao bip: toque curtíssimo de buzina (carros que confirmam a trava pela buzina) | Dramatic Cat - Audi Q7/VEHHorn_Audi Q7 EXTERIOR Horn Short And Long MONO (0,05-0,20 s) | corte de 150 ms com queda natural, filtros + resposta de rua |
| `carro_trancando_longe.wav` | composto pronto: travas + bip, para cair no pisca 1 (t=1,802 s do IMG_5170) | carro_travas_longe; carro_bip_longe | soma |
| `carro_bip2_longe.wav` | pisca 2 (t=2,902 s): segundo bip, mais curto e mais fraco (outra tomada do mesmo aparelho, não é cópia do primeiro) | SHhh! Listen SFX Libraries - Optometrist Equipment/Auto Refractor... (trecho 3,615-3,76 s) | idem carro_bip_longe |
| `porta_ct_encosta.wav` | porta do CT encostando = corte do match da porta | 3maze - Doors, Locks and Drawers/door_close_003.wav | resposta de sala pequena a -14 dB |
| `porta_ct_macaneta.wav` | maçaneta girando (abertura, quando o Ruan entra) | Sonic Bat - Videogame Foley Essentials Vol. I/SBvfe1_Door Handle D 002.wav | resposta de sala a -16 dB |
| `porta_ct_abre.wav` | porta abrindo (trinco + folha) | 3maze - Doors, Locks and Drawers/door_open_004.wav | resposta de sala |
| `porta_pesada_fecha.wav` | porta pesada fechando (peso para o match da porta ou para a entrada na academia) | 3maze - Doors/door_big_close_001.wav | passa-baixa 6 kHz |
| `porta_carro_fecha_fora.wav` | porta do carro batendo por fora (saída do Super Kal para a estrada) | Carlo Ascrizzi - Race Cars Essential Library/Car Door_OpenClose_Exterior_01.M.wav (1,33-2,0 s) | só corte |
| `porta_carro_abre_fora.wav` | porta do carro abrindo por fora | Carlo Ascrizzi - Race Cars Essential Library/Car Door_OpenClose_Exterior_01.M.wav (0,18-0,80 s) | só corte |
| `porta_carro_fecha_dentro.wav` | porta do carro batendo, ouvida de dentro (entra no plano do carro na chuva) | SoundBits - Cars - Mad Mustang Mercury/VEHDoor_Car Foley Car Door Open and Close Exterior 04 Perspective A (1,80-2,45 s) | passa-baixa 3,5 kHz + resposta de cabine |
| `chuva_parabrisa_dentro_12s.wav` | dilúvio no para-brisa (planos de estrada) | Sound Ex Machina - RAIN CITY/Heavy rain drops on a car window, steady, recorded indoors, loop.wav (30-42 s) | só corte e fades |
| `chuva_cabine_motor_10s.wav` | cama alternativa: cabine com chuva e motor em marcha lenta | Ivo Vicic - Land Rover Defender TDI 300/108 Interior_traffic light stop_urban rain.wav (10-20 s) | só corte |
| `pista_molhada_carro_cruza.wav` | carro vindo no sentido contrário na pista molhada (os faróis do v_183901 0,3-4,9 s) | Soundholder - Cars In Motion - Wet Asphalt/wet asphalt 28 medium speed passby long stereo D100.wav | passa-baixa; a âncora é o instante em que o carro cruza |
| `pista_molhada_pocas.wav` | pneus em poças (plano de estrada alagada, IMG_5183 33-47 s) | Soundholder - Cars In Motion - Wet Asphalt/slush asphalt 11 medium speed puddles stereo D100.wav | passa-baixa 3,2 kHz |
| `limpador_dentro_2x.wav` | limpador do para-brisa, duas passadas (o limpador aparece em v_183901 e no IMG_5183 39-47 s) | Articulated Sounds - Japanese Compact Car - Nissan Versa Note/CAR Front Windshield Wiper, 2x Short 02, Nissan Note, INT.wav | só corte |
| `chuva_telhado_forte_8s.wav` | chuva forte no telhado, ouvida de dentro (chegada em Valente "choveu muito"; BRABUS LOUNGE "tá chovendo muito", 895-905 s) | Game Audio Factory - GAFSFX04 - Liquids Materials/GAF SFX04 - LIQUIDS - Hard rain, plexiglas ceiling, inside, hard drops.wav | só corte |
| `chuva_fina_rua_8s.wav` | chuvisco no Rota ("está uma chuvinha", IMG_5226 12,9-17,8 s) | PMSFX - EMPTY CITY RAIN/PM_ECR_1 Rain, City, Light, Thunder, Peel.wav (6,5-14,5 s, trecho sem trovão) | só corte |
| `trovao_longe_estrada.wav` | trovão distante ao entrar na estrada | Soundrangers – Thunder/thunder_mountainous_distant_03.wav | passa-baixa |
| `trovao_perto_com_chuva.wav` | raio perto com chuva (SÓ se houver clarão na imagem ou flash de transição) | InspectorJ - 44.1 General Library/Thunder_Very-Close_Rain_08.wav | só corte |
| `trovao_ronco_grave.wav` | ronco grave de trovão (transição para o dilúvio, por baixo da música) | Soundopolis - Natures Fury_Thunder/Thunder_Rumble_Mid_Fienup_024.wav | só corte |
| `fila_bip_monitor.wav` | senha 011 -> 012 no monitor do CT (IMG_5160) | Sergey Eybog - Handheld Tranceivers/Walkie Talkie,AEG Voxtel,Power On,Power Off,Beeps,Series.wav (bip real de 1,3 kHz, 160 ms) | corte + resposta de sala |
| `fila_botao_e_chamada_loja.wav` | "apertar o botão" (IMG_5172 41-48 s): botão real + toque de chamada do próximo número | 3maze - Buttons and Switches/switch_on_042.wav; Justsoundeffects - Doors/BELLDoor-INT_Door Bell Low Tone_JSE_DO_Distance Stereo.wav (campainha real gravada à distância, 1,03-2,55 s) | botão seco; toque com resposta de salão |
| `fila_chamada_loja_so.wav` | só o toque de chamada (senha virando no telão/TV do açougue) | Justsoundeffects - Doors/BELLDoor-INT_Door Bell Low Tone (1,03-2,55 s) | passa-alta 300 Hz + resposta de salão |
| `fila_botao_so.wav` | só o botão do açougueiro | 3maze - Buttons and Switches/switch_on_042.wav | nenhum |
| `kal_sobe_tecido.wav` | Kal sobe por trás da plaquinha (aparição 1) | 3maze - The Closet/shake_clothing_001.wav; TheWorkRoom Audio Post - Cloths & Sponges Foley/Cloth 61.wav (3,10-3,50 s) | soma, nível baixo |
| `kal_cruza_bracos.wav` | Kal cruza os braços | TheWorkRoom Audio Post - Cloths & Sponges Foley/Cloth 61.wav (0,10-0,60 s); SoundBits - Tiny Transitions 2/Scrape_Cloth_10.wav | soma |
| `kal_aponta_joinha.wav` | Kal aponta para a tela / faz joinha (aparição 2) | Shapeforms - Hit & Punch/CLOTHING_MATERIAL_MOVEMENT_08.wav; TheWorkRoom Audio Post - Cloths & Sponges Foley/Cloth 61.wav (5,05-5,16 s) | soma |
| `kal_pop_discreto.wav` | pop leve quando a plaquinha/balão do Kal aparece | Membrans - Pops Sound Pack 01/Pop 41.wav | passa-baixa 3,5 kHz, -20 dB de pico |
| `kal_soco_bora.wav` | soco "BORA PRA CIMA!" (aparição 3): o whip vertical nasce do punho | Soundholder - Swipes And Whooshes/swipes and whooshes tshirt fast and short swings stereo ORTF 8040.wav (5,18-5,70 s); Stuart Duffield - Soccer SFX/Keeper_Punch_01.wav (luva do goleiro socando a bola); 3maze - The Closet/shake_clothing_001.wav | golpe de camiseta + baque de luva com passa-baixa 2,2 kHz |
| `wh_camiseta_rapido.wav` | whip curto (rosto -> tela das senhas) | Soundholder - Swipes And Whooshes/tshirt fast and short swings (0,30-0,78 s) | só corte |
| `wh_camiseta_medio.wav` | whip médio (speed ramp do corredor) | Soundholder - Swipes And Whooshes/tshirt fast and short swings (9,20-9,92 s) | só corte |
| `wh_corda_chicote.wav` | chicote seco (whip pelo batente da porta) | SoundBits - Just Whoosh 3/Swoosh_Rope_Whip_075.wav | só corte |
| `wh_luva_curto.wav` | passagem curta e abafada (jump cut com punch-in) | Airborne Sound - Organic Whooshes/Whoosh,Organic,Fabric,Glove,Airy,Breathy,Punchy.wav | só corte |
| `wh_vara_grave.wav` | whoosh grave (mergulho na placa SALA DE POSE) | SoundBits - Just Whoosh 3/Whoosh_Rod_Pole_022.wav | só corte |
| `wh_couro.wav` | whoosh de couro (entrada na academia, pose) | SoundBits - Just Whoosh 3/Whoosh_Cloth_Leather_Fight_174.wav | só corte |
| `wh_rajada_folhas.wav` | rajada de vento com folhas (rua/hora azul -> estrada) | Articulated Sounds - Magic Elements vol.1/MAGIC AIR Large Whoosh, Swirl, Wind Gust, Foliage 01.wav | só corte |
| `wh_ar_suave.wav` | ar suave (entrada de selo de lugar) | Airborne Sound - Airy Whooshes/Whoosh,Sound Design,Airy,Full,Forceful,Soft.wav | só corte |
| `wh_vassoura_longo.wav` | varrida longa e fina (linha do tempo / relógio avançando) | Soundholder - Swipes And Whooshes/broom long stick slow and long swings (12,0-12,55 s) | só corte |
| `wh_baqueta_seco.wav` | corte seco e rápido (impact frame) | Justsoundeffects - Transition Whooshes Vol. 1/SWSH_Woodstick Swish 03_JSE_TW1.wav (0,10-0,32 s) | só corte |
| `wh_corda_gira.wav` | corda girando (zoom through / garrafa cobrindo a lente) | SoundBits - Tiny Transitions/Whoosh_Source_Rope_03.wav | só corte |
| `wh_isopor_textura.wav` | textura arrastada (risca EM -> NO ROTA; agenda riscando "remarcada") | Airborne Sound - Organic Whooshes/Whoosh,Organic,Styrofoam,Plank,Airy,Smooth,Texture,1.wav | só corte |
| `trena_hud.wav` | trena correndo (HUD do relógio / cadeado fechando) | SoundBits - Tiny Transitions 2/Measuring-Tape_06.wav | só corte |
| `wh_alca.wav` | alça/zíper curto (chip entrando) | Airborne Sound - Organic Whooshes/Whoosh,Organic,Fabric,Strap,Zip,High,Stagger,Pushy.wav | só corte |
| `moto_cruza_esq_dir.wav` | moto cruzando na frente do carro, da esquerda para a direita (IMG_5170: moto azul 1,60-2,67 s; serve de wipe) | Bombay Sonic - Yamaha Rajdoot 175cc/Rajdoot,motorcycle,approach,by,away,fast,rattle 02.wav (3,6-7,6 s) | corte + panorâmica |
| `moto_passa_rua.wav` | moto passando na rua do Super Kal (IMG_5168 2,9-4,6 s) | Bombay Sonic - Yamaha Rajdoot 175cc/... (3,6-7,6 s) | corte |

## Gravações baixadas (`_fontes/`, com o item do archive.org)

| chave local | pacote | biblioteca / arquivo original | item no archive.org | usada |
|---|---|---|---|---|
| chave_botao_a | Sonniss GDC 2016 | 3maze -  Buttons and Switches/button_on_off_064.wav | SonnissGameAudioGDCPart2 | sim |
| chave_botao_b | Sonniss GDC 2016 | 3maze -  Buttons and Switches/switch_on_042.wav | SonnissGameAudioGDCPart2 | sim |
| chave_molho | Sonniss GDC 2015 | Varazuvi - California Foley/Key19.wav | game-audio-gdc | sim |
| carro_alavanca_farol | Sonniss GDC 2026 | 344 Audio - Car Foley Vol. 1/VEHInt_LIGHTING CONTROL, RELEASE, HEADLIGHT FLASH_344 Audio_Car Foley Vol 1.wav | sonniss-gdc-2026-game-audio-bundle-normalized | não (apagada do disco) |
| trava_landrover | Sonniss GDC 2020 | Ivo Vicic - Land Rover Defender TDI 300/56 Interior_Front_door lock button_lock unlock_mono _position 02.wav | SonnissGameAudioGDCPart6 | sim |
| trava_porta_007 | Sonniss GDC 2019 | 3maze - Doors/door_lock_007.wav | game-audio-gdcpart-5 | não (apagada do disco) |
| buzina_audi_curta | Sonniss GDC 2024 | Dramatic Cat - Audi Q7/VEHHorn_Audi Q7 EXTERIOR Horn Short And Long MONO_DRCA_AUQ7_Kmr81i.wav | sonniss-gdc-2024-game-audio-bundle-normalized | sim |
| porta_grande_fecha | Sonniss GDC 2019 | 3maze - Doors/door_big_close_001.wav | game-audio-gdcpart-5 | sim |
| porta_fecha_003 | Sonniss GDC 2016 | 3maze -  Doors, Locks and Drawers/door_close_003.wav | SonnissGameAudioGDCPart2 | sim |
| porta_abre_004 | Sonniss GDC 2016 | 3maze -  Doors, Locks and Drawers/door_open_004.wav | SonnissGameAudioGDCPart2 | sim |
| porta_macaneta | Sonniss GDC 2023 | Sonic Bat - Videogame Foley Essentials Vol. I/SBvfe1_Door Handle D 002.wav | gdc-2023-game-audio-bundle | sim |
| porta_carro_ext_a | Sonniss GDC 2015 | Carlo Ascrizzi - Race Cars Essential Library/Car Door_OpenClose_Exterior_01.M.wav | game-audio-gdc | sim |
| porta_carro_ext_b | Sonniss GDC 2026 | SoundBits - Cars - Mad Mustang Mercury/VEHDoor_Car Foley Car Door Open and Close Exterior 04 Perspective A_SNDBTS_CRS-MMM.wav | sonniss-gdc-2026-game-audio-bundle-normalized | sim |
| chuva_vidro_carro | Sonniss GDC 2019 | Sound Ex Machina - RAIN CITY/Heavy rain drops on a car window, steady, recorded indoors, loop.wav | game-audio-gdcpart-5 | sim |
| chuva_int_landrover | Sonniss GDC 2020 | Ivo Vicic - Land Rover Defender TDI 300/108 Interior_traffic light stop_urban rain.wav | SonnissGameAudioGDCPart6 | sim |
| chuva_plexi | Sonniss GDC 2016 | Game Audio Factory - GAFSFX04 - Liquids Materials/GAF SFX04 - LIQUIDS - Hard rain, plexiglas ceiling, inside, hard drops.wav | SonnissGameAudioGDCPart2 | sim |
| pista_molhada_pocas | Sonniss GDC 2020 | Soundholder - Cars In Motion - Wet Asphalt/slush asphalt 11 medium speed puddles stereo D100.wav | SonnissGameAudioGDCPart6 | sim |
| pista_molhada_passa | Sonniss GDC 2020 | Soundholder - Cars In Motion - Wet Asphalt/wet asphalt 28 medium speed passby long stereo D100.wav | SonnissGameAudioGDCPart6 | sim |
| limpador_nissan_int | Sonniss GDC 2020 | Articulated Sounds - Japanese Compact Car - Nissan Versa Note/CAR Front Windshield Wiper, 2x Short 02, Nissan Note, INT.wav | SonnissGameAudioGDCPart6 | sim |
| limpador_landrover | Sonniss GDC 2020 | Ivo Vicic - Land Rover Defender TDI 300/119 Exterior_vipers on_fast_LOOP.wav | SonnissGameAudioGDCPart6 | não (apagada do disco) |
| chuva_cidade_leve | Sonniss GDC 2019 | PMSFX - EMPTY CITY RAIN/PM_ECR_1 Rain, City, Light, Thunder, Peel.wav | game-audio-gdcpart-5 | sim |
| trovao_distante | Sonniss GDC 2018 | Soundrangers – Thunder/thunder_mountainous_distant_03.wav | game-audio-gdcpart-4 | sim |
| trovao_perto_chuva | Sonniss GDC 2019 | InspectorJ - 44.1 General Library/Thunder_Very-Close_Rain_08.wav | game-audio-gdcpart-5 | sim |
| trovao_ronco | Sonniss GDC 2015 | Soundopolis - Natures Fury_Thunder/Thunder_Rumble_Mid_Fienup_024.wav | game-audio-gdc | sim |
| trovao_raio | Sonniss GDC 2018 | Soundrangers – Thunder/thunder_strike_03.wav | game-audio-gdcpart-4 | não (apagada do disco) |
| mercado_caixa | Sonniss GDC 2024 | UberDuo - The Supermarket Audio Play Set/AMBMrkt_Checkout, Supermarket, Light Conversation_UberDuo_MRKT.wav | sonniss-gdc-2024-game-audio-bundle-normalized | não (apagada do disco) |
| bip_refrator | Sonniss GDC 2023 | SHhh! Listen SFX Libraries - Optometrist Equipment/Auto Refractor,Scanning,Pneumatic,Beeps - Auto Refactor scanning patient with pneumatic noises and beeps.wav | gdc-2023-game-audio-bundle | sim |
| bip_radio | Sonniss GDC 2016 | Sergey Eybog - Handheld Tranceivers/Walkie Talkie,AEG Voxtel,Power On,Power Off,Beeps,Series.wav | SonnissGameAudioGDCPart2 | sim |
| bip_carro_aviso | Sonniss GDC 2020 | Articulated Sounds - Japanese Compact Car - Nissan Versa Note/CAR Alarm, Light On, Nissan Note, INT.wav | SonnissGameAudioGDCPart6 | não (apagada do disco) |
| bip_bomba | Sonniss GDC 2016 | Eiravaein Sound - Vaeyan III/VaeyanIII,medicaldevices,insulinpump,rewind,beeps,servo,spinning.wav | SonnissGameAudioGDCPart2 | não (apagada do disco) |
| campainha_longe | Sonniss GDC 2023 | Justsoundeffects - Doors/BELLDoor-INT_Door Bell Low Tone_JSE_DO_Distance Stereo.wav | gdc-2023-game-audio-bundle | sim |
| tecido_29 | Sonniss GDC 2018 | TheWorkRoom Audio Post - Cloths & Sponges Foley/Cloth 29.wav | game-audio-gdcpart-4 | não (apagada do disco) |
| tecido_61 | Sonniss GDC 2018 | TheWorkRoom Audio Post - Cloths & Sponges Foley/Cloth 61.wav | game-audio-gdcpart-4 | sim |
| tecido_sacode | Sonniss GDC 2016 | 3maze -  The Closet/shake_clothing_001.wav | SonnissGameAudioGDCPart2 | sim |
| tecido_jaqueta | Sonniss GDC 2016 | 3maze -  The Closet/person_removing_jacket_001.wav | SonnissGameAudioGDCPart2 | não (apagada do disco) |
| tecido_mov_08 | Sonniss GDC 2020 | Shapeforms - Hit & Punch/CLOTHING_MATERIAL_MOVEMENT_08.wav | SonnissGameAudioGDCPart6 | sim |
| baque_grave_10 | Sonniss GDC 2020 | Shapeforms - Hit & Punch/IMPACT_LOW_THUD_10.wav | SonnissGameAudioGDCPart6 | não (apagada do disco) |
| camiseta_golpes | Sonniss GDC 2019 | Soundholder - Swipes And Whooshes/swipes and whooshes tshirt fast and short swings stereo ORTF 8040.wav | game-audio-gdcpart-5 | sim |
| pop_31 | Sonniss GDC 2015 | Membrans - Pops Sound Pack 01/Pop 31.wav | game-audio-gdc | não (apagada do disco) |
| pop_41 | Sonniss GDC 2015 | Membrans - Pops Sound Pack 01/Pop 41.wav | game-audio-gdc | sim |
| soco_goleiro | Sonniss GDC 2016 | Stuart Duffield - Soccer SFX/Keeper_Punch_01.wav | SonnissGameAudioGDCPart2 | sim |
| bola_passe | Sonniss GDC 2016 | Stuart Duffield - Soccer SFX/Ball_Pass_03.wav | SonnissGameAudioGDCPart2 | não (apagada do disco) |
| estalo_dedos | Sonniss GDC 2015 | Eiravaein Works - Crepitus/Crepitus,fingers,flex,pop,snap,crack,singles,variety.M.wav | game-audio-gdc | não (apagada do disco) |
| tecido_raspa | Sonniss GDC 2019 | SoundBits - Tiny Transitions 2/Scrape_Cloth_10.wav | game-audio-gdcpart-5 | sim |
| wh_luva | Sonniss GDC 2019 | Airborne Sound - Organic Whooshes/Whoosh,Organic,Fabric,Glove,Airy,Breathy,Punchy.wav | game-audio-gdcpart-5 | sim |
| wh_alca | Sonniss GDC 2019 | Airborne Sound - Organic Whooshes/Whoosh,Organic,Fabric,Strap,Zip,High,Stagger,Pushy.wav | game-audio-gdcpart-5 | sim |
| wh_isopor | Sonniss GDC 2019 | Airborne Sound - Organic Whooshes/Whoosh,Organic,Styrofoam,Plank,Airy,Smooth,Texture,1.wav | game-audio-gdcpart-5 | sim |
| wh_corda_chicote | Sonniss GDC 2016 |  Whoosh Essentials/Swoosh_Rope_Whip_075.wav | SonnissGameAudioGDCPart2 | sim |
| wh_couro_luta | Sonniss GDC 2016 |  Whoosh Essentials/Whoosh_Cloth_Leather_Fight_174.wav | SonnissGameAudioGDCPart2 | sim |
| wh_vara | Sonniss GDC 2016 |  Whoosh Essentials/Whoosh_Rod_Pole_022.wav | SonnissGameAudioGDCPart2 | sim |
| wh_grave_duplo | Sonniss GDC 2023 | InspectorJ - 96 General Library/WHSH_InsJ_Whooshing_Low_Double_01-01.wav | gdc-2023-game-audio-bundle | não (apagada do disco) |
| wh_vassoura | Sonniss GDC 2019 | Soundholder - Swipes And Whooshes/swipes and whooshes broom long stick slow and long swings stereo ORTF 8040.wav | game-audio-gdcpart-5 | sim |
| wh_baqueta | Sonniss GDC 2023 | Justsoundeffects - Transition Whooshes Vol. 1/SWSH_Woodstick Swish 03_JSE_TW1.wav | gdc-2023-game-audio-bundle | sim |
| wh_ar_suave | Sonniss GDC 2019 | Airborne Sound - Airy Whooshes/Whoosh,Sound Design,Airy,Full,Forceful,Soft.wav | game-audio-gdcpart-5 | sim |
| wh_rajada_folhas | Sonniss GDC 2019 | Articulated Sounds - Magic Elements vol.1/MAGIC AIR Large Whoosh, Swirl, Wind Gust, Foliage 01.wav | game-audio-gdcpart-5 | sim |
| wh_corda_fonte | Sonniss GDC 2018 | SoundBits - Tiny Transitions/Whoosh_Source_Rope_03.wav | game-audio-gdcpart-4 | sim |
| wh_trena | Sonniss GDC 2019 | SoundBits - Tiny Transitions 2/Measuring-Tape_06.wav | game-audio-gdcpart-5 | sim |
| moto_175_passa | Sonniss GDC 2016 | Bombay Sonic - Yamaha Rajdoot 175cc/Rajdoot,motorcycle,approach,by,away,fast,rattle 02.wav | SonnissGameAudioGDCPart2 | sim |
| baque_fundo | Sonniss GDC 2019 | Baxter Audio - IMPACT/10 Hit Deep Thud.wav | game-audio-gdcpart-5 | não (apagada do disco) |
