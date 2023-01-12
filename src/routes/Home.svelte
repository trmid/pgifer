<script type="ts">
	import { Contract, ethers } from "ethers";
  import { tick } from "svelte";
  import { erc721 } from "../utils/erc721";

	// Variables:
	let addresses = [""];
  let pferPromises: Promise<{ metadata: any, image: string }>[] = [];
  let pferImages: HTMLImageElement[] = [];
  let disabledPfers = new Set<string>();
  let runLog = "";
  let gifURI = "";
  let frameDuration = 100;
  let generating = false;
  let rendering = false;
  let typingAddresses = false;

  // Check addresses after timeout
  $: addresses && triggerAddressTimeout();

  // Ethereum Provider:
  const provider = new ethers.providers.JsonRpcProvider("https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161", 1);
	
	// Functions:
  const log = (msg: string) => {
    runLog += `${msg}\n`;
  };

  const error = (msg: string) => {
    runLog += `<span style='color:red;'>${msg}</span>\n`;
  };

	const generateGIF = async () => {

    // Set vars:
    generating = true;
    addresses = addresses.filter(a => !!a);
    runLog = "";
    gifURI = "";
    pferPromises = [];
    pferImages = [];
    disabledPfers = new Set();

    // Create debug vars:
    let numImagesLoaded = 0;
    let lastStep = "init";

    try {
      if(addresses.length < 1) return error("At least one address is required...");
      addresses = await resolvedAddresses(addresses);
      for(const address of addresses) {
        if(!ethers.utils.isAddress(address)) return alert("One or more address is invalid.");
      }

      // Get pfer list:
      lastStep = "fetching";
      log("Fetching your pfers...");
      for(let i = 0; i < addresses.length; i++) {
        pferPromises = pferPromises.concat((await pfers(addresses[i])).map(x => x.data()));
      }
      log(`${pferPromises.length} pfers found!\n`);

      // Wait for all to be resolved:
      lastStep = "resolving";
      log("Resolving pfer data...");
      const res = await Promise.all(pferPromises);
      res.sort((a,b) => {
        return a.metadata.attributes.filter((x: any) => x.trait_type === "Background")[0].value < 
          b.metadata.attributes.filter((x: any) => x.trait_type === "Background")[0].value ? 
          -1 : 1;
      });
      log("Resolved all pfer data successfully!\n");

      // Create image elements:
      lastStep = "loading";
      log("Fetching pfer images...");
      pferImages = res.map(x => { const image = new Image(); image.src = x.image; return image; });
      await Promise.all(pferImages.map(x => new Promise<void>((resolve, reject) => {
        x.onload = () => {
          numImagesLoaded++;
          resolve();
        };
        x.onerror = reject;
      })));
      log("Fetched all pfer images!\n");

      // Create GIF:
      lastStep = "generating";
      log("Creating your personalized GIF. This may take a while...");
      gifURI = await renderGIF(pferImages);
      runLog = "";

    } catch(err) {
      console.error(err);
      error("Failed to generate GIF... Please check the logs or reload the page and retry.");
      if(lastStep === 'loading' && numImagesLoaded > pferPromises.length / 2) {
        log("<i>Note: It seems like most of your pfers loaded, but some of them may have resolved incorrectly. Please reload the page and try again.</i>");
      }
    } finally {
      generating = false;
    }
	};

  const renderGIF = async (images: HTMLImageElement[]) => {
    return new Promise<string>((resolve, reject) => {
      try {
        rendering = true;
        var gif = new GIF({
          workers: 2,
          quality: 10,
          width: 1200,
          height: 1200
        });
        
        // Add image elements:
        for(let i = 0; i < images.length; i++) {
          gif.addFrame(images[i], { delay: frameDuration });
        }
        
        // Render:
        gif.on('finished', function(blob: any) {
          rendering = false;
          const uri = URL.createObjectURL(blob);
          resolve(uri);
        });
        gif.render();
      } catch(err) {
        reject(err);
        rendering = false;
      }
    });
  };

	const pfers = async(address: string): Promise<{ data: () => Promise<{ metadata: any, image: string }>, category: string }[]> => {
    const nftContracts: Record<string, { contract: string, category: string, unique?: boolean }> = {
      pfer: {
        contract: "0xBCC664B1E6848caba2Eb2f3dE6e21F81b9276dD8",
        category: "pfer",
        unique: true
      }
    };
    const avatarPromises: { data: () => Promise<{ metadata: any, image: string }>, category: string }[] = [];
    const promises: Promise<any>[] = [];
    for(const key in nftContracts) {
      promises.push((async () => {
        const contract = new Contract(nftContracts[key].contract, erc721, provider);
        const addToken = (tokenId: ethers.BigNumberish) => {
          avatarPromises.push({ data: () => (async () => {
            const tokenURI = await contract.tokenURI(tokenId);
            const metadata = await (await fetch("/ipfs/" + tokenURI.slice(7))).json();
            const url = "/ipfs/" + metadata.image.slice(7);
            return { metadata, image: url };
          })(), category: nftContracts[key].category });
        };
        const balance = await contract.balanceOf(address);
        if(balance > 0) {
          if(nftContracts[key].unique) {
            const tokenInFilter = contract.filters.Transfer(null, address);
            const tokenOutFilter = contract.filters.Transfer(address, null);
            const tokenInEvents = await contract.queryFilter(tokenInFilter);
            const tokenOutEvents = await contract.queryFilter(tokenOutFilter);
            const sequentialTransfers = tokenInEvents.concat(tokenOutEvents);
            if(sequentialTransfers.length > 1) {
              sequentialTransfers.sort((a,b) => a.blockNumber - b.blockNumber);
            }
            const tokenIds = new Set<string>();
            const lowerCaseAddress = address.toLowerCase();
            for(let i = 0; i < sequentialTransfers.length; i++) {
              const event = sequentialTransfers[i];
              if(event.args && event.args["tokenId"] && event.args["to"] && event.args["from"]) {
                const tokenId = ethers.BigNumber.from(event.args["tokenId"]).toHexString();
                if(event.args["to"].toLowerCase() === lowerCaseAddress)
                  tokenIds.add(tokenId);
                else if(event.args["from"].toLowerCase() === lowerCaseAddress)
                  tokenIds.delete(tokenId);
              }
            }
            for(const tokenId of tokenIds) {
              addToken(ethers.BigNumber.from(tokenId));
            }
          } else {
            addToken(0);
          }
        }
      })());
    }
    await Promise.allSettled(promises).catch(console.error);
    return avatarPromises;
  };

  const addAddress = () => {
    const index = addresses.length;
    addresses = [...addresses, ""];
    tick().then(() => {
      (document.querySelector(`.address-input[data-index="${index}"]`) as HTMLInputElement | null)?.focus();
    });
  };

  const removeAddress = (index: number) => {
    if(addresses.length > 1) {
      addresses = addresses.filter((v, i) => i !== index);
    }
  };

  const resolvedAddresses = async (resolvables: string[]) => {
    const addresses = [...resolvables];
    for(let i = 0; i < resolvables.length; i++) {
      if(addresses[i].toLowerCase().endsWith('.eth')) {
        const address = await provider.resolveName(addresses[i]);
        if(address) {
          addresses[i] = address;
        } else {
          addresses[i] = "resolution failed: (" + addresses[i] + ")";
        }
      }
    }
    return addresses;
  };

  let addressTimeout: NodeJS.Timeout | null = null;
  const triggerAddressTimeout = () => {
    typingAddresses = true;
    if(addressTimeout) clearTimeout(addressTimeout);
    addressTimeout = setTimeout(() => {
      typingAddresses = false;
    }, 800);
  };

  let dragIndex = -1;
  const startDrag = (e: DragEvent, index: number) => {
    e.dataTransfer?.setData("text", "" + index);
    setTimeout(() => {
      dragIndex = index;
    }, 0);
  };
  let dragOverIndex = -1;
  const dragOver = (index: number) => {
    dragOverIndex = index;
  };
  const onDrop = (e: DragEvent, dropIndex: number) => {

    // Swap images:
    if(dragIndex > -1 && dropIndex > -1) {
      if(!(dragIndex == dropIndex || dragIndex == dropIndex - 1)) {
        const newImages: HTMLImageElement[] = [];
        for(let i = 0; i < pferImages.length + 1; i++) {
          if(i != dragIndex) {
            if(i == dropIndex) {
              newImages.push(pferImages[dragIndex]);
            }
            if(i < pferImages.length) {
              newImages.push(pferImages[i]);
            }
          }
        }
        pferImages = newImages;
      }
    }
    cancelDrag();
  };
  const cancelDrag = () => {
    dragIndex = -1;
    dragOverIndex = -1;
  };

</script>

<!-- Title -->
<h1>GIF your pfers</h1>

<!-- Inputs -->
<div id="inputs">
  {#each addresses as address, i}
    <div class="address">
      <input type="text" class="address-input" data-index={i} placeholder="Address or ENS (0x0...)" on:keypress={e => e.key === "Enter" ? addAddress() : null} bind:value={addresses[i]} class:invalid={address.length > 0 && !ethers.utils.isAddress(address) && !address.endsWith('.eth') && !typingAddresses}>
      {#if addresses.length > 1}
        <button class="delete" title="remove" on:click={() => removeAddress(i)}><i class="icofont-delete" /></button>
      {/if}
      {#if address.length > 0 && !ethers.utils.isAddress(address) && !address.endsWith('.eth') && !typingAddresses}
        <div class="invalid">
          Please enter a valid ethereum address or ENS name.
        </div>
      {/if}
    </div>
  {/each}
  <button title="Add another address" on:click={addAddress}><i class="icofont-ui-add"/> Address</button>
  <div class="range-input">
    <strong>Frame Duration:</strong>
    <input type="range" min={10} max={1000} step={10} bind:value={frameDuration}>
    <span>
      <input type="number" bind:value={frameDuration} min={10} max={1000} step={10}> (ms)
    </span>
  </div>
  <button on:click={generateGIF}>GIF My Flock!</button>
</div>

<!-- GIF -->
{#if gifURI}
  <hr>
  <img id="gif" src={gifURI} alt="">
  <br>
  <a href={gifURI} download="pgifer - {addresses[0]}{addresses.length > 1 ? `+${addresses.length - 1}` : ""}.gif">Download GIF</a>
{/if}

<!-- Loaded pfers -->
{#if generating}
  <hr>
  <h3>Loading...</h3>
  <div class="pfers">
    {#each pferPromises as pferPromise }
      <div class="pfer icofont-">
        {#await pferPromise}
          <!-- nothing -->
        {:then { image }}
          <img src={image} alt="">
        {/await}
      </div>
    {/each}
  </div>
{:else if pferImages.length > 0}
  <hr>
  <h3>Customize your GIF!</h3>
  <ul>
    <li>Drag and drop to reorder your pfers</li>
    <li>Click to toggle a pfer</li>
  </ul>
  <div class="pfers" class:dragging={dragIndex > -1}>
    {#each pferImages as image, i }
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <div
        class="pfer icofont-"
        class:disabled={disabledPfers.has(image.src)}
        on:click={() => { disabledPfers.has(image.src) ? disabledPfers.delete(image.src) : disabledPfers.add(image.src); disabledPfers = disabledPfers; }}
        style:transform="translateX({dragOverIndex == i ? 3 : ((dragOverIndex == i+1) ? -3 : 0)}px)"
      >
        <img src={image.src} alt="" draggable="true" on:dragstart={e => startDrag(e, i)} on:dragend={() => cancelDrag()}>
        <div class="dropzone" class:hover={dragOverIndex == i} on:dragover|preventDefault={() => dragOver(i)} on:drop|preventDefault={e => onDrop(e, i)} />
      </div>
    {/each}
    <div class="pfer-placeholder">
      <div class="dropzone" class:hover={dragOverIndex == pferImages.length} on:dragover|preventDefault={() => dragOver(pferImages.length)} on:drop|preventDefault={e => onDrop(e, pferImages.length)} />
    </div>
  </div>
  <br>
  <button disabled={rendering}  on:click={() => renderGIF(pferImages.filter(i => !disabledPfers.has(i.src))).then(uri => gifURI = uri).catch(console.error)}>
    {#if rendering}
      Rendering <i class="icofont-spinner-alt-2 spin" />
    {:else}
      Update GIF
    {/if}
  </button>
{/if}

<!-- Log -->
{#if runLog}
  <div id="overlay">
    <div class="logs">{@html runLog}</div>
  </div>

<!-- Render Overlay -->
{:else if rendering}
  <div id="overlay">
    <div class="rendering">
      Rendering <i class="icofont-spinner-alt-2 spin" />
    </div>
  </div>
{/if}

<!-- Style -->
<style>
	#inputs {
		display: flex;
    flex-direction: column;
		justify-content: flex-start;
		align-items: flex-start;
		gap: 1rem;
	}

	input[type="text"], button {
		padding: 1rem 1rem;
		border-radius: 1rem;
		border: 1px solid currentColor;
	}

	button {
		cursor: pointer;
	}

  .address {
    position: relative;
    display: flex;
    gap: 0.5rem;
    align-items: stretch;
  }

  .address > input.invalid {
    border: 1px solid crimson;
  }

  .address > div.invalid {
    display: none;
  }

  .address:hover > div.invalid {
    display: block;
    position: absolute;
    width: 100%;
    left: 0;
    bottom: calc(100% + 0.5rem);
    padding: 0.5rem;
    background-color: crimson;
    color: white;
    border-radius: 1rem;
    pointer-events: none;
    z-index: 1;
  }

  button.delete {
    font-size: 20px;
    padding: 0.5rem 1rem;
  }

  #gif {
    display: block;
    width: 256px;
    height: 256px;
    border-radius: 16px;
    margin-top: 1rem;
  }

	.pfers {
		display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
	}

  .pfer, .pfer > img, .pfer-placeholder {
    position: relative;
    display: block;
    width: 48px;
    height: 48px;
    border-radius: 8px;
    cursor: pointer;
  }

  .pfer.disabled {
    filter: grayscale(1);
    opacity: 0.6;
  }

  .pfer > img {
    z-index: 1;
  }

  .pfer::before {
    content: "\eff5";
    position: absolute;
    inset: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 24px;
    animation-name: spin;
    animation-duration: 2s;
    animation-iteration-count: infinite;
    animation-play-state: running;
    animation-timing-function: linear;
  }

  .dropzone {
    display: none;
    opacity: 0;
    position: absolute;
    width: 100%;
    top: 0;
    bottom: 0;
    left: -50%;
    background-color: dodgerblue;
    z-index: 1;
    border-radius: 8px;
  }

  .dragging .dropzone {
    display: block;
  }

  .dropzone.hover {
    opacity: 0.5;
  }

  .range-input {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    padding: 7px 12px;
    border-radius: 1rem;
    border: 1px solid currentColor;
  }

  #overlay {
    position: fixed;
    inset: 0;
    z-index: 2;
    background-color: #0008;
    color: white;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  #overlay > .logs {
    padding: 1rem;
    width: 600px;
    max-width: 90vw;
    height: 600px;
    max-height: 90%;
    white-space: pre-wrap;
    overflow-y: auto;
    border-radius: 1rem;
    background-color: #000c;
  }

  #overlay > .rendering {
    border-radius: 1rem;
    background-color: #000c;
    padding: 1rem;
    font-size: 24px;
  }

  .spin {
    display: inline-block;
    animation-name: spin;
    animation-duration: 2s;
    animation-iteration-count: infinite;
    animation-play-state: running;
    animation-timing-function: linear;
  }
</style>