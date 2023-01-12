<script type="ts">
	import { Contract, ethers } from "ethers";
  import { erc721 } from "../utils/erc721";

	// Variables:
	let addresses = [""];
  let pferPromises: Promise<{ metadata: any, image: string }>[][] = [[]];
  let runLog = "";
  let gifURI = "";
  let frameDuration = 100;
  let generating = false;
	
	// Functions:
  const log = (msg: string) => {
    runLog += `${msg}\n`;
  };

  const error = (msg: string) => {
    runLog += `<span style='color:red;'>${msg}</span>\n`;
  };

	const generateGIF = async () => {
    generating = true;
    addresses = addresses.filter(a => !!a);
    runLog = "";
    gifURI = "";
    pferPromises = addresses.map(a => []);
    try {
      if(addresses.length < 1) return error("At least one address is required...");
      for(const address of addresses) {
        if(!ethers.utils.isAddress(address)) return alert("One or more address is invalid.");
      }

      // Get pfer list:
      log("Fetching your pfers...");
      let numPfers = 0;
      let allPferPromises: typeof pferPromises[0] = [];
      for(let i = 0; i < addresses.length; i++) {
        pferPromises[i] = (await pfers(addresses[i])).map(x => x.data());
        allPferPromises = allPferPromises.concat(pferPromises[i]);
        numPfers += pferPromises[i].length;
      }
      log(`${numPfers} pfers found!\n`);

      // Wait for all to be resolved:
      log("Resolving pfer data...");
      const res = await Promise.all(allPferPromises);
      res.sort((a,b) => {
        return a.metadata.attributes.filter((x: any) => x.trait_type === "Background")[0].value < 
          b.metadata.attributes.filter((x: any) => x.trait_type === "Background")[0].value ? 
          -1 : 1;
      });
      log("Resolved all pfer data successfully!\n");

      // Create image elements:
      log("Fetching pfer images...");
      const images = res.map(x => { const image = new Image(); image.src = x.image; return image; });
      await Promise.all(images.map(x => new Promise((resolve) => {
        x.onload = () => {
          setTimeout(resolve, 0);
        };
      })));
      log("Fetched all pfer images!\n");

      // Create GIF:
      log("Creating your personalized GIF. This may take a while...");
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
        gifURI = URL.createObjectURL(blob);
        runLog = "";
      });
      gif.render();

    } catch(err) {
      console.error(err);
      error("Failed to generate GIF... Please check the logs or reload the page and retry.");
    } finally {
      generating = false;
    }
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
        const contract = new Contract(nftContracts[key].contract, erc721, new ethers.providers.JsonRpcProvider("https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161", 1));
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

  const removeAddress = (index: number) => {
    if(addresses.length > 1) {
      addresses = addresses.filter((v, i) => i !== index);
    }
  };

</script>

<!-- Title -->
<h1>GIF your pfers</h1>

<!-- Inputs -->
<div id="inputs">
  {#each addresses as address, i}
    <div class="address">
      <input type="text" placeholder="Address (0x0...)" bind:value={addresses[i]} class:invalid={address.length > 0 && !ethers.utils.isAddress(address)}>
      {#if addresses.length > 1}
        <button class="delete" title="remove" on:click={() => removeAddress(i)}><i class="icofont-delete" /></button>
      {/if}
      {#if address.length > 0 && !ethers.utils.isAddress(address)}
        <div class="invalid">
          Please enter a valid ethereum address.
        </div>
      {/if}
    </div>
  {/each}
  <button title="Add another address" on:click={() => addresses = [...addresses, ""]}><i class="icofont-ui-add"/> Address</button>
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
  <img id="gif" src={gifURI} alt="">
  <br>
  <a href={gifURI} download="pgifer - {addresses[0]}{addresses.length > 1 ? `+${addresses.length - 1}` : ""}.gif">Download GIF</a>
{/if}

<!-- Loaded pfers -->
{#each addresses as address, i}
  {#if pferPromises[i] && pferPromises[i].length > 0}
    <h3>{address}</h3>
    <div class="pfers">
      {#each pferPromises[i] as pferPromise }
        <div class="pfer icofont-">
          {#await pferPromise}
            <!-- nothing -->
          {:then { image }}
            <img src={image} alt="">
          {/await}
        </div>
      {/each}
    </div>
  {/if}
{/each}

<!-- Log -->
{#if runLog}
  <div id="overlay">
    <div class="logs">{@html runLog}</div>
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

  .pfer, .pfer > img {
    position: relative;
    display: block;
    width: 48px;
    height: 48px;
    border-radius: 8px;
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
</style>